import express from "express";
import {
  createPaymentIntentController,
  webhookController,
} from "../controllers/stripeController.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

// Webhook handler must be before bodyParser
router.post(
  "/webhook",
  // Use raw body for webhook signature verification
  express.raw({ type: "application/json" }),
  webhookController
);

// Create payment intent (protected route)
router.post(
  "/create-payment-intent",
  authenticateToken, // Your authentication middleware
  express.json(), // Parse JSON body
  createPaymentIntentController
);

export default router;
