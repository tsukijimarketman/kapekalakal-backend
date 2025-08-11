import { Router } from "express";
import {
  createPaymentIntentController,
  createSourceController,
  confirmPaymongoPaymentController,
} from "../controllers/paymentController.js";
import { authenticateToken } from "../middleware/auth.js";

const router = Router();

router.post("/create", createPaymentIntentController);
router.post("/source", createSourceController);
router.post("/confirm", authenticateToken, confirmPaymongoPaymentController);

export default router;
