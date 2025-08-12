import { createPaymentIntent } from "../services/paymongoService.js";
import { createSource } from "../services/paymongoService.js";
import Transaction from "../models/transaction.js";
import Product from "../models/product.js";
import Cart from "../models/cart.js";
import { createPayment, getSource } from "../services/paymongoService.js";

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
    const { sourceId, items, shippingAddress, latitude, longitude } = req.body;
    const customerId = req.user?.id;
    if (!customerId) {
      return res.status(401).json({
        success: false,
        message:
          "Unauthorized: missing user. Make sure you are logged in and cookies are sent (withCredentials).",
      });
    }

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
        image: product.image,
        price: product.price,
        quantity: item.quantity,
        subtotal,
      });
    }

    const vat = itemsSubtotal * 0.08;
    const shippingFee = 120;
    const totalAmount = itemsSubtotal + vat + shippingFee;

    // Fetch the source to get canonical amount/currency and status
    let source;
    try {
      const sourceRes = await getSource(sourceId);
      source = sourceRes?.data?.data;
    } catch (srcErr) {
      console.error(
        "PayMongo getSource error:",
        srcErr?.response?.data || srcErr
      );
      return res.status(500).json({
        success: false,
        message: "Failed to fetch PayMongo source",
        details: srcErr?.response?.data || srcErr?.message,
      });
    }

    const srcAttrs = source?.attributes || {};
    const srcStatus = srcAttrs?.status;
    const srcAmount = srcAttrs?.amount; // already in centavos
    const srcCurrency = srcAttrs?.currency || "PHP";

    if (!srcAmount || !srcCurrency) {
      return res.status(400).json({
        success: false,
        message: "Invalid PayMongo source: missing amount/currency",
      });
    }

    // Source must be chargeable after user authorization
    if (srcStatus !== "chargeable") {
      return res.status(400).json({
        success: false,
        message: `Source not chargeable (status: ${srcStatus})`,
      });
    }

    // Optionally validate that server-computed total matches source amount (±1 centavo)
    const expectedCentavos = Math.round(totalAmount * 100);
    if (Math.abs(srcAmount - expectedCentavos) > 1) {
      console.warn(
        `Warning: PayMongo source amount (${srcAmount}) != computed total (${expectedCentavos})`
      );
      // We still proceed using srcAmount as PayMongo requires exact amount matching the source
    }

    // Create the payment using source's amount and currency
    let paymentRes;
    try {
      paymentRes = await createPayment({
        amount: srcAmount,
        currency: srcCurrency,
        sourceId,
      });
    } catch (pmErr) {
      console.error(
        "PayMongo createPayment error:",
        pmErr?.response?.data || pmErr
      );
      return res.status(500).json({
        success: false,
        message: "Failed to create PayMongo payment",
        details: pmErr?.response?.data || pmErr?.message,
      });
    }
    const payment = paymentRes.data?.data;
    const status = payment?.attributes?.status;
    if (status !== "paid") {
      return res.status(400).json({
        success: false,
        message: `Payment not paid (status: ${status})`,
      });
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
    estimatedDelivery.setDate(estimatedDelivery.getDate() + 1);

    // Normalize coordinates from body (no metadata)
    const latNum =
      latitude !== undefined && latitude !== null ? Number(latitude) : 0;
    const lonNum =
      longitude !== undefined && longitude !== null ? Number(longitude) : 0;

    // Create transaction
    const transaction = await Transaction.create({
      customerId,
      items: validatedItems,
      itemsSubtotal,
      vat,
      shippingFee,
      totalAmount,
      paymentMethod: "Paymongo",
      paymentIntentId: payment?.id,
      shippingAddress,
      status: "to_receive",
      cancellationDeadline,
      canCancel: true,
      deliveryInfo: {
        estimatedDelivery,
        latitude: Number.isFinite(latNum) ? latNum : 0,
        longitude: Number.isFinite(lonNum) ? lonNum : 0,
      },
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

    return res.status(201).json({
      success: true,
      message: "Transaction created successfully",
      data: transaction,
    });
  } catch (err) {
    console.error(
      "confirmPaymongoPaymentController error:",
      err?.response?.data || err
    );
    res.status(500).json({
      success: false,
      message: err.message || "Server error",
      details: err?.response?.data,
    });
  }
}
