import express from "express";
import {
  createTransaction,
  checkoutTransaction,
  cancelTransaction,
  getUserTransactions,
  getTransactionById,
  createPaidTransaction,
  confirmReceipt,
  validatePickup,
  validateDelivery,
} from "../controllers/transactionController.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

// All transaction routes require authentication
router.use(authenticateToken);

// CREATE TRANSACTION - Add to cart (goes to "To Pay")
// POST /api/transactions
router.post("/", createTransaction);

// CHECKOUT TRANSACTION - Move from "To Pay" to "To Receive"
// PUT /api/transactions/:id/checkout
router.put("/:id/checkout", checkoutTransaction);

// CANCEL TRANSACTION - Only within 5-minute window with reason
// PUT /api/transactions/:id/cancel
router.put("/:id/cancel", cancelTransaction);

// GET USER TRANSACTIONS - For UserPanel display
// GET /api/transactions/user
router.get("/user", getUserTransactions);

// GET TRANSACTION BY ID - Get specific transaction details
// GET /api/transactions/:id
router.get("/:id", getTransactionById);

// CREATE PAID TRANSACTION - When user pays (goes to "To Receive")
// POST /api/transactions/paid
router.post("/paid", createPaidTransaction);

// CONFIRM RECEIPT - User confirms they received the order; disables cancel and marks completed
// PUT /api/transactions/:id/confirm-receipt
router.put("/:id/confirm-receipt", confirmReceipt);

// VALIDATE PICKUP - Admin validates pickup photo and updates transaction status
// PUT /api/transactions/:id/validate-pickup
router.put("/:id/validate-pickup", validatePickup);

// VALIDATE DELIVERY - Admin validates delivery photo and completes transaction
// PUT /api/transactions/:id/validate-delivery
router.put("/:id/validate-delivery", validateDelivery);

export default router;
