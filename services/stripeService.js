import Stripe from "stripe";

// Initialize Stripe with your secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// /**
//  * Create a payment intent
//  * @param {number} amount - Amount in the smallest currency unit (e.g., centavos for PHP)
//  * @param {Object} metadata - Additional data to store with the payment intent
//  * @returns {Promise<Object>} Payment intent object
//  */

export const createPaymentIntent = async (amount, metadata = {}) => {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount), // Ensure amount is an integer
      currency: process.env.STRIPE_CURRENCY?.toLowerCase() || "php",
      metadata,
      automatic_payment_methods: {
        enabled: true,
      },
    });
    return paymentIntent;
  } catch (error) {
    console.error("Error creating payment intent:", error);
    throw error;
  }
};

// /**
//  * Handle Stripe webhook events
//  * @param {string} signature - Stripe signature from the request headers
//  * @param {Buffer|string} payload - Raw request body
//  * @param {string} webhookSecret - Webhook signing secret
//  * @returns {Promise<Object>} Stripe event object
//  */

export const handleWebhook = async (signature, payload, webhookSecret) => {
  try {
    const event = stripe.webhooks.constructEvent(
      payload,
      signature,
      webhookSecret
    );
    return event;
  } catch (error) {
    console.error("Webhook signature verification failed:", error.message);
    throw new Error("Invalid webhook signature");
  }
};

// /**
//  * Get payment intent details
//  * @param {string} paymentIntentId - Stripe payment intent ID
//  * @returns {Promise<Object>} Payment intent details
//  */

export const getPaymentIntent = async (paymentIntentId) => {
  try {
    return await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch (error) {
    console.error("Error retrieving payment intent:", error);
    throw error;
  }
};
