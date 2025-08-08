import Transaction from "../models/transaction.js";
import Product from "../models/product.js";
import User from "../models/user.js";
import Cart from "../models/cart.js";

// CREATE TRANSACTION - When user adds to cart (goes to "To Pay")
export const createTransaction = async (req, res) => {
  console.log("Create transaction request received:", req.body);

  try {
    const { items, paymentMethod, shippingAddress } = req.body;
    const customerId = req.user.id; // From auth middleware

    // Validate that all products exist and have enough stock
    let itemsSubtotal = 0;
    const validatedItems = [];

    for (const item of items) {
      const product = await Product.findById(item.productId);

      if (!product) {
        return res.status(404).json({
          success: false,
          message: `Product not found: ${item.productId}`,
        });
      }

      if (!product.isActive || product.stock < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for product: ${product.name}`,
        });
      }

      const subtotal = product.price * item.quantity;
      itemsSubtotal += subtotal;

      validatedItems.push({
        productId: product._id,
        name: product.name,
        price: product.price,
        quantity: item.quantity,
        subtotal: subtotal,
      });
    }

    // Calculate totals
    const vat = itemsSubtotal * 0.08; // 8% VAT
    const shippingFee = 120; // Static shipping fee
    const totalAmount = itemsSubtotal + vat + shippingFee;

    // Create transaction - NO STOCK SUBTRACTION YET
    // Stock will only be subtracted when user actually checks out
    const transaction = await Transaction.create({
      customerId,
      items: validatedItems,
      itemsSubtotal,
      vat,
      shippingFee,
      totalAmount,
      paymentMethod,
      shippingAddress,
      status: "to_pay",
      statusHistory: [
        {
          status: "to_pay",
          timestamp: new Date(),
          updatedBy: customerId,
        },
      ],
    });

    console.log(
      "Transaction created successfully (stock not yet subtracted):",
      transaction.transactionId
    );
    res.status(201).json({
      success: true,
      message: "Transaction created successfully",
      data: transaction,
    });

    const productIds = validatedItems.map((i) => i.productId.toString());
    await Cart.updateOne(
      { user: customerId },
      { $pull: { items: { product: { $in: productIds } } } }
    );
  } catch (error) {
    console.error("Create transaction error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};

// CHECKOUT TRANSACTION - Move from "To Pay" to "To Receive"
export const checkoutTransaction = async (req, res) => {
  console.log("Checkout transaction request:", req.params.id);

  try {
    const { id } = req.params;
    const customerId = req.user.id;

    const transaction = await Transaction.findById(id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    // Verify ownership
    if (transaction.customerId.toString() !== customerId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    // Can only checkout from 'to_pay' status
    if (transaction.status !== "to_pay") {
      return res.status(400).json({
        success: false,
        message: "Transaction cannot be checked out",
      });
    }

    // IMPORTANT: Re-validate stock availability before checkout
    // This prevents overselling if stock changed while item was in cart
    for (const item of transaction.items) {
      const currentProduct = await Product.findById(item.productId);

      if (!currentProduct) {
        return res.status(404).json({
          success: false,
          message: `Product no longer available: ${item.name}`,
        });
      }

      if (!currentProduct.isActive || currentProduct.stock < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${item.name}. Available: ${currentProduct.stock}, Requested: ${item.quantity}`,
        });
      }
    }

    // NOW subtract stock (only when user actually pays/checks out)
    for (const item of transaction.items) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { stock: -item.quantity },
      });
    }

    // Set cancellation deadline (5 minutes from now)
    const cancellationDeadline = new Date();
    cancellationDeadline.setMinutes(cancellationDeadline.getMinutes() + 5);

    // Set estimated delivery (2 days from now)
    const estimatedDelivery = new Date();
    estimatedDelivery.setDate(estimatedDelivery.getDate() + 2);

    // Update transaction
    const updatedTransaction = await Transaction.findByIdAndUpdate(
      id,
      {
        status: "to_receive",
        cancellationDeadline,
        canCancel: true,
        "deliveryInfo.estimatedDelivery": estimatedDelivery,
        $push: {
          statusHistory: {
            status: "to_receive",
            timestamp: new Date(),
            updatedBy: customerId,
          },
        },
      },
      { new: true }
    );

    console.log(
      "Transaction checked out successfully (stock now subtracted):",
      transaction.transactionId
    );
    res.status(200).json({
      success: true,
      message: "Transaction checked out successfully",
      data: updatedTransaction,
    });
  } catch (error) {
    console.error("Checkout transaction error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};

// CANCEL TRANSACTION - Only within 5-minute window with reason
export const cancelTransaction = async (req, res) => {
  console.log("Cancel transaction request:", req.params.id);

  try {
    const { id } = req.params;
    const { cancellationReason } = req.body; // Get cancellation reason from request
    const customerId = req.user.id;

    // Validate cancellation reason
    if (!cancellationReason || !cancellationReason.trim()) {
      return res.status(400).json({
        success: false,
        message: "Cancellation reason is required",
      });
    }

    const transaction = await Transaction.findById(id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    // Verify ownership
    if (transaction.customerId.toString() !== customerId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    // Check if cancellation is allowed
    if (
      !transaction.canCancel ||
      new Date() > transaction.cancellationDeadline
    ) {
      return res.status(400).json({
        success: false,
        message: "Cancellation deadline has passed",
      });
    }

    // Can only cancel from 'to_receive' status
    if (transaction.status !== "to_receive") {
      return res.status(400).json({
        success: false,
        message: "Transaction cannot be cancelled",
      });
    }

    // Restore product stock
    for (const item of transaction.items) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { stock: item.quantity },
      });
    }

    // Update transaction with cancellation details
    const updatedTransaction = await Transaction.findByIdAndUpdate(
      id,
      {
        status: "cancelled",
        canCancel: false,
        cancellationReason: cancellationReason.trim(),
        cancellationDate: new Date(),
        $push: {
          statusHistory: {
            status: "cancelled",
            timestamp: new Date(),
            updatedBy: customerId,
          },
        },
      },
      { new: true }
    );

    console.log(
      "Transaction cancelled successfully:",
      transaction.transactionId
    );
    res.status(200).json({
      success: true,
      message: "Transaction cancelled successfully",
      data: updatedTransaction,
    });
  } catch (error) {
    console.error("Cancel transaction error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};

// GET USER TRANSACTIONS - For UserPanel display
export const getUserTransactions = async (req, res) => {
  console.log("Get user transactions request:", req.user.id);

  try {
    const customerId = req.user.id;
    const { status, page = 1, limit = 10 } = req.query;

    // Build query
    const query = { customerId };
    if (status && status !== "all") {
      query.status = status;
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    // Get transactions with product details
    const transactions = await Transaction.find(query)
      .populate("items.productId", "name image category")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const totalTransactions = await Transaction.countDocuments(query);
    const totalPages = Math.ceil(totalTransactions / limitNum);

    console.log(`Found ${transactions.length} transactions for user`);
    res.status(200).json({
      success: true,
      message: "Transactions retrieved successfully",
      data: {
        transactions,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalTransactions,
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1,
        },
      },
    });
  } catch (error) {
    console.error("Get user transactions error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};

// GET TRANSACTION BY ID
export const getTransactionById = async (req, res) => {
  console.log("Get transaction by ID request:", req.params.id);

  try {
    const { id } = req.params;
    const customerId = req.user.id;

    const transaction = await Transaction.findById(id)
      .populate("customerId", "firstName lastName email")
      .populate("items.productId", "name image category")
      .populate("deliveryInfo.assignedDeliveryId", "firstName lastName");

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    // Verify ownership (or admin access)
    if (
      transaction.customerId._id.toString() !== customerId &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    console.log(
      "Transaction retrieved successfully:",
      transaction.transactionId
    );
    res.status(200).json({
      success: true,
      message: "Transaction retrieved successfully",
      data: transaction,
    });
  } catch (error) {
    console.error("Get transaction by ID error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};

export const createPaidTransaction = async (req, res) => {
  console.log("Create paid transaction request received:", req.body);

  try {
    const { items, paymentMethod, shippingAddress, paymentIntentId } = req.body;
    const customerId = req.user.id;

    if (!Array.isArray(items) || items.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Items are required" });
    }

    if (!shippingAddress || typeof shippingAddress !== "string") {
      return res
        .status(400)
        .json({ success: false, message: "Valid shippingAddress is required" });
    }

    if (!paymentMethod) {
      return res
        .status(400)
        .json({ success: false, message: "paymentMethod is required" });
    }

    // Validate that all products exist and have enough stock, compute totals
    let itemsSubtotal = 0;
    const validatedItems = [];

    for (const item of items) {
      const product = await Product.findById(item.productId);

      if (!product) {
        return res.status(404).json({
          success: false,
          message: `Product not found: ${item.productId}`,
        });
      }

      if (!product.isActive || product.stock < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for product: ${product.name}`,
        });
      }

      const subtotal = product.price * item.quantity;
      itemsSubtotal += subtotal;

      validatedItems.push({
        productId: product._id,
        name: product.name,
        price: product.price,
        quantity: item.quantity,
        subtotal,
      });
    }

    const vat = itemsSubtotal * 0.08; // 8%
    const shippingFee = 120; // static
    const totalAmount = itemsSubtotal + vat + shippingFee;

    // Subtract stock now (payment already succeeded)
    for (const item of validatedItems) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { stock: -item.quantity },
      });
    }

    // Set cancellation deadline (5 minutes from now)
    const cancellationDeadline = new Date();
    cancellationDeadline.setMinutes(cancellationDeadline.getMinutes() + 5);

    // Set estimated delivery (2 days from now)
    const estimatedDelivery = new Date();
    estimatedDelivery.setDate(estimatedDelivery.getDate() + 2);

    const transaction = await Transaction.create({
      customerId,
      items: validatedItems,
      itemsSubtotal,
      vat,
      shippingFee,
      totalAmount,
      paymentMethod,
      paymentIntentId,
      shippingAddress,
      status: "to_receive",
      cancellationDeadline,
      canCancel: true,
      deliveryInfo: { estimatedDelivery },
      statusHistory: [
        { status: "to_receive", timestamp: new Date(), updatedBy: customerId },
      ],
    });

    console.log(
      "Paid transaction created successfully:",
      transaction.transactionId
    );
    console.log(
      "Paid transaction created successfully:",
      transaction.transactionId
    );

    // Remove purchased items from cart (cleanup)
    try {
      const productIds = validatedItems.map((i) => i.productId.toString());
      await Cart.updateOne(
        { user: customerId },
        { $pull: { items: { product: { $in: productIds } } } }
      );
    } catch (cleanupErr) {
      console.error("Cart cleanup after Stripe payment failed:", cleanupErr);
      // Do not fail the request; transaction already created.
    }

    res.status(201).json({
      success: true,
      message: "Transaction created successfully",
      data: transaction,
    });
  } catch (error) {
    console.error("Create paid transaction error:", error);
    res
      .status(500)
      .json({ success: false, message: error.message || "Server error" });
  }
};
