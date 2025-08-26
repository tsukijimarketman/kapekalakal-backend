import {
  createPaymentIntent,
  handleWebhook,
} from "../services/stripeService.js";

// /**
//  * @desc    Create a payment intent
//  * @route   POST /api/stripe/create-payment-intent
//  * @access  Private
//  */

export const createPaymentIntentController = async (req, res) => {
  try {
    const { amount, metadata = {} } = req.body;

    if (!amount || isNaN(amount)) {
      return res.status(400).json({
        success: false,
        error: "Valid amount is required",
      });
    }

    // Add user ID to metadata if available
    if (req.user) {
      metadata.userId = req.user.id;
    }

    const paymentIntent = await createPaymentIntent(amount, metadata);

    res.status(200).json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error("Error in createPaymentIntent:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create payment intent",
      details:
        process.env.NODE_ENV === "production" ? error.message : undefined,
    });
  }
};

// /**
//  * @desc    Handle Stripe webhooks
//  * @route   POST /api/stripe/webhook
//  * @access  Public (Stripe will call this endpoint)
//  */

export const webhookController = async (req, res) => {
  const sig = req.headers["stripe-signature"];

  try {
    const event = await handleWebhook(
      sig,
      req.rawBody || req.body,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    // Handle the event
    switch (event.type) {
      case "payment_intent.succeeded":
        const paymentIntent = event.data.object;
        console.log("PaymentIntent was successful!", paymentIntent.id);
        // Here you would typically update your order status in the database
        // Example: await updateOrderStatus(paymentIntent.metadata.orderId, 'paid');
        break;

      case "payment_intent.payment_failed":
        const failedPayment = event.data.object;
        console.log("Payment failed:", failedPayment.id);
        // Handle failed payment
        break;

      // Add more event types as needed
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // Return a 200 response to acknowledge receipt of the event
    res.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }
};
