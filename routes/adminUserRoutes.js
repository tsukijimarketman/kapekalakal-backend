import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import {
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  getUserRoles,
} from "../controllers/adminUserController.js";

/**
 * ADMIN USER ROUTES
 * These routes handle user management operations in the admin panel
 * They are separate from userRoutes.js which handles user profile operations
 *
 * Base URL: /api/admin/users
 */

const router = Router();

// All routes require authentication (admin only)
// You can add additional admin role checking middleware here if needed

// GET /api/admin/users - Get all users with search, filtering, and pagination
router.get("/", authenticateToken, getAllUsers);

// GET /api/admin/users/roles - Get all available user roles for dropdown
router.get("/roles", authenticateToken, getUserRoles);

// GET /api/admin/users/:id - Get a single user by ID
router.get("/:id", authenticateToken, getUserById);

// POST /api/admin/users - Create a new user
router.post("/", authenticateToken, createUser);

// PUT /api/admin/users/:id - Update a user
router.put("/:id", authenticateToken, updateUser);

// DELETE /api/admin/users/:id - Delete a user
router.delete("/:id", authenticateToken, deleteUser);

export default router;
