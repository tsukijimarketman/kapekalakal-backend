import express from "express";
import {
  createTransaction,
  checkoutTransaction,
  cancelTransaction,
  getUserTransactions,
  getTransactionById,
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

export default router;
