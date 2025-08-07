import { Router } from "express";
import {
  createPaymentIntentController,
  createSourceController,
} from "../controllers/paymentController.js";

const router = Router();

router.post("/create", createPaymentIntentController);
router.post("/source", createSourceController);

export default router;
