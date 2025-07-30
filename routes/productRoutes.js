import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  getProductCategories,
} from "../controllers/productController.js";

const router = Router();

// Public routes (no authentication required)
// GET /api/products - Get all products with search and filtering
router.get("/", getAllProducts);

// GET /api/products/categories - Get all product categories
router.get("/categories", getProductCategories);

// GET /api/products/:id - Get a single product by ID
router.get("/:id", getProductById);

// Protected routes (authentication required)
// POST /api/products - Create a new product (Admin only)
router.post("/", authenticateToken, createProduct);

// PUT /api/products/:id - Update a product (Admin only)
router.put("/:id", authenticateToken, updateProduct);

// DELETE /api/products/:id - Delete a product (Admin only)
router.delete("/:id", authenticateToken, deleteProduct);

export default router;
