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
        image: (item.image ?? product.image) || "",
        price: product.price,
        quantity: item.quantity,
        subtotal: subtotal,
      });
    }

    // Calculate totals
    const vat = itemsSubtotal * 0.08; // 8% VAT
    const shippingFee = 120; // Static shipping fee
    const totalAmount = itemsSubtotal + vat + shippingFee;

    // Ensure each item has an image (backfill)
    const PLACEHOLDER = "https://via.placeholder.com/120?text=No+Image";
    for (let i = 0; i < validatedItems.length; i++) {
      if (!validatedItems[i].image) {
        try {
          const p = await Product.findById(validatedItems[i].productId).select(
            "image"
          );
          validatedItems[i].image = p?.image || PLACEHOLDER;
        } catch {
          validatedItems[i].image = PLACEHOLDER;
        }
      }
    }

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
      deliveryInfo: {
        latitude: req.body.latitude,
        longitude: req.body.longitude,
      },
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

// GET TRANSACTION BY ID - Get a single transaction by ID
export const getTransactionById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const transaction = await Transaction.findOne({
      _id: id,
      $or: [
        { customerId: userId },
        { 'deliveryInfo.assignedDeliveryId': userId }
      ]
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found or access denied'
      });
    }

    res.status(200).json({
      success: true,
      data: transaction
    });
  } catch (error) {
    console.error('Get transaction by ID error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
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
    const [transactions, totalTransactions] = await Promise.all([
      Transaction.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Transaction.countDocuments(query),
    ]);

    const totalPages = Math.ceil(totalTransactions / limitNum) || 1;

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
      message: error.message || "Server error"
    });
  }
};

// CONFIRM RECEIPT - User confirms they received the order; disables cancel and marks completed
export const confirmReceipt = async (req, res) => {
  console.log("Confirm receipt request:", req.params.id);

  try {
    const { id } = req.params;
    const customerId = req.user.id;

    // Verify the transaction exists and belongs to the user
    const transaction = await Transaction.findOne({
      _id: id,
      customerId: customerId,
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found or you don't have permission",
      });
    }

    // Check if already completed
    if (transaction.status === "completed") {
      return res.status(400).json({
        success: false,
        message: "Transaction already completed",
      });
    }

    // Update transaction status to completed
    const updated = await Transaction.findByIdAndUpdate(
      id,
      {
        $set: { status: "completed" },
        $push: {
          statusHistory: {
            status: "completed",
            timestamp: new Date(),
            updatedBy: customerId,
          },
        },
      },
      { new: true }
    );

    console.log("Transaction confirmed received:", updated.transactionId);
    res
      .status(200)
      .json({ success: true, message: "Receipt confirmed", data: updated });
  } catch (error) {
    console.error("Confirm receipt error:", error);
    res
      .status(500)
      .json({ success: false, message: error.message || "Server error" });
  }
};

export const validatePickup = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id; // From auth middleware
    const currentTime = new Date();

    // Find and update the transaction
    const transaction = await Transaction.findOneAndUpdate(
      {
        _id: id,
        "deliveryInfo.pickupPhoto": { $exists: true, $ne: "" },
        "deliveryInfo.pickupValidated": false,
      },
      {
        $set: {
          "deliveryInfo.pickupValidated": true,
          "deliveryInfo.adminValidatedPickupAt": currentTime,
          "deliveryInfo.assignedDeliveryId": req.user.id, // Assign to current admin
        },
        $push: {
          statusHistory: {
            status: "pickup_validated",
            timestamp: currentTime,
            updatedBy: adminId,
          },
        },
      },
      { new: true }
    );

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found or pickup already validated",
      });
    }

    // If both pickup and delivery are validated, mark as completed
    if (transaction.deliveryInfo.deliveryValidated) {
      await Transaction.findByIdAndUpdate(id, {
        status: "completed",
        $push: {
          statusHistory: {
            status: "completed",
            timestamp: new Date(),
            updatedBy: adminId,
          },
        },
      });
    }

    res.status(200).json({
      success: true,
      message: "Pickup validated successfully",
      transaction,
    });
  } catch (error) {
    console.error("Error validating pickup:", error);
    res.status(500).json({
      success: false,
      message: "Error validating pickup",
      error: error.message,
    });
  }
};

export const validateDelivery = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id; // From auth middleware
    const currentTime = new Date();

    // Find and update the transaction
    const transaction = await Transaction.findOneAndUpdate(
      {
        _id: id,
        "deliveryInfo.deliveryPhoto": { $exists: true, $ne: "" },
        "deliveryInfo.deliveryValidated": false,
      },
      {
        $set: {
          "deliveryInfo.deliveryValidated": true,
          "deliveryInfo.adminValidatedDeliveryAt": currentTime,
          "deliveryInfo.deliveredAt": currentTime,
          "deliveryInfo.assignedDeliveryId": req.user.id, // Assign to current admin
        },
        $push: {
          statusHistory: {
            status: "delivery_validated",
            timestamp: currentTime,
            updatedBy: adminId,
          },
        },
      },
      { new: true }
    );

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found or delivery already validated",
      });
    }

    // If both pickup and delivery are validated, mark as completed
    if (transaction.deliveryInfo.pickupValidated) {
      await Transaction.findByIdAndUpdate(id, {
        status: "completed",
        $push: {
          statusHistory: {
            status: "completed",
            timestamp: new Date(),
            updatedBy: adminId,
          },
        },
      });
    }

    res.status(200).json({
      success: true,
      message: "Delivery validated successfully",
      transaction,
    });
  } catch (error) {
    console.error("Error validating delivery:", error);
    res.status(500).json({
      success: false,
      message: "Error validating delivery",
      error: error.message,
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
        image: (item.image ?? product.image) || "",
        price: product.price,
        quantity: item.quantity,
        subtotal,
      });
    }

    const vat = itemsSubtotal * 0.08; // 8%
    const shippingFee = 120; // static
    const totalAmount = itemsSubtotal + vat + shippingFee;

    // Ensure each item has an image (backfill)
    const PLACEHOLDER = "https://via.placeholder.com/120?text=No+Image";
    for (let i = 0; i < validatedItems.length; i++) {
      if (!validatedItems[i].image) {
        try {
          const p = await Product.findById(validatedItems[i].productId).select(
            "image"
          );
          validatedItems[i].image = p?.image || PLACEHOLDER;
        } catch {
          validatedItems[i].image = PLACEHOLDER;
        }
      }
    }

    // Subtract stock now (payment already succeeded)
    for (const item of validatedItems) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { stock: -item.quantity },
      });
    }

    // Set cancellation deadline (5 minutes from now)
    const cancellationDeadline = new Date();
    cancellationDeadline.setMinutes(cancellationDeadline.getMinutes() + 5);

    // Set estimated delivery (1 day from now)
    const estimatedDelivery = new Date();
    estimatedDelivery.setDate(estimatedDelivery.getDate() + 1);

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
      deliveryInfo: {
        estimatedDelivery,
        latitude: req.body.latitude,
        longitude: req.body.longitude,
      },
      statusHistory: [
        { status: "to_receive", timestamp: new Date(), updatedBy: customerId },
      ],
    });

    console.log(
      "Paid transaction created successfully:",
      transaction.transactionId
    );

    console.log("validatedItems", validatedItems);
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
