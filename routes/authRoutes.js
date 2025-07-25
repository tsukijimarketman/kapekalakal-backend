import { Router } from "express";
const router = Router();
import {
  signup,
  signin,
  verifyToken,
  signout,
} from "../controllers/authController.js";
import express from "express";
import { authenticateToken } from "../middleware/auth.js";

//auth
router.post("/signup", signup);
router.post("/signin", signin);
router.get("/verify", authenticateToken, verifyToken);
router.post("/signout", authenticateToken, signout);

export default router;
