import { Router } from "express";
import {
  createPaymentIntentController,
  createSourceController,
  confirmPaymongoPaymentController,
} from "../controllers/paymentController.js";

const router = Router();

router.post("/create", createPaymentIntentController);
router.post("/source", createSourceController);
router.post("/confirm", confirmPaymongoPaymentController);

export default router;
