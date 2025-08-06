// backend/routes/cartRoutes.js
import express from "express";
import { authenticateToken } from "../middleware/auth.js";
import {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
} from "../controllers/cartController.js";

const router = express.Router();

router.use(authenticateToken); // All routes require authentication

router.route("/").get(getCart).post(addToCart).delete(clearCart);

router.route("/:itemId").put(updateCartItem).delete(removeFromCart);

export default router;
