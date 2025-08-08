import { createPaymentIntent } from "../services/paymongoService.js";
import { createSource } from "../services/paymongoService.js";
import Transaction from "../models/transaction.js";
import Product from "../models/product.js";
import Cart from "../models/cart.js";
import { createPayment } from "../services/paymongoService.js";

//POST /api/payment/create

export async function createPaymentIntentController(req, res) {
  try {
    const { amount, currency, paymentMethod } = req.body;
    const response = await createPaymentIntent({
      amount,
      currency,
      paymentMethod,
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({
      error: error.response?.data || error.message,
    });
  }
}

export async function createSourceController(req, res) {
  try {
    const { amount, currency, type, redirectUrl } = req.body;
    const response = await createSource({
      amount,
      currency,
      type,
      redirectUrl,
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({
      error: error.response?.data || error.message,
    });
  }
}

export async function confirmPaymongoPaymentController(req, res) {
  try {
    const { sourceId, items, shippingAddress } = req.body;
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

    // Recompute totals from DB
    let itemsSubtotal = 0;
    const validatedItems = [];
    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return res
          .status(404)
          .json({
            success: false,
            message: `Product not found: ${item.productId}`,
          });
      }
      if (!product.isActive || product.stock < item.quantity) {
        return res
          .status(400)
          .json({
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
    const vat = itemsSubtotal * 0.08;
    const shippingFee = 120;
    const totalAmount = itemsSubtotal + vat + shippingFee;

    // Create the PayMongo payment using the source
    const paymentRes = await createPayment({
      amount: Math.round(totalAmount * 100) / 100, // if PayMongo expects cents, multiply by 100; else keep PHP amount. Adjust to your current usage.
      currency: "PHP",
      sourceId,
    });
    const payment = paymentRes.data?.data;

    // minimal paid check
    const status = payment?.attributes?.status;
    if (status !== "paid") {
      return res
        .status(400)
        .json({ success: false, message: "Payment not paid" });
    }

    // Subtract stock
    for (const i of validatedItems) {
      await Product.findByIdAndUpdate(i.productId, {
        $inc: { stock: -i.quantity },
      });
    }

    // Cancellation deadline + ETA
    const cancellationDeadline = new Date();
    cancellationDeadline.setMinutes(cancellationDeadline.getMinutes() + 5);
    const estimatedDelivery = new Date();
    estimatedDelivery.setDate(estimatedDelivery.getDate() + 2);

    // Create transaction
    const transaction = await Transaction.create({
      customerId,
      items: validatedItems,
      itemsSubtotal,
      vat,
      shippingFee,
      totalAmount,
      paymentMethod: "Paymongo",
      paymentIntentId: payment?.id, // PayMongo payment id
      shippingAddress,
      status: "to_receive",
      cancellationDeadline,
      canCancel: true,
      deliveryInfo: { estimatedDelivery },
      statusHistory: [
        { status: "to_receive", timestamp: new Date(), updatedBy: customerId },
      ],
    });

    // Remove purchased items from cart
    const productIds = validatedItems.map((i) => i.productId.toString());
    await Cart.updateOne(
      { user: customerId },
      { $pull: { items: { product: { $in: productIds } } } }
    );

    res.status(201).json({
      success: true,
      message: "Transaction created successfully",
      data: transaction,
    });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: err.message || "Server error" });
  }
}
