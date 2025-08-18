import { Router } from "express";
import { authenticateToken, authorizeRole } from "../middleware/auth.js";
import multer from "multer";
import {
  listAvailableTasks,
  acceptTask,
  getMyTasks,
  pickupComplete,
  deliveryComplete,
  validateDelivery,
  validatePickup,
  listTasks,
  getRiderStats,
} from "../controllers/deliveryController.js";

const router = Router();

router.use(authenticateToken); // All routes require authentication

// Multer setup for image uploads (5MB limit)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

//Delivery rider
router.get("/available", authorizeRole("delivery"), listAvailableTasks);
router.post("/:id/accept", authorizeRole("delivery"), acceptTask);
router.get("/my", authorizeRole("delivery"), getMyTasks);
router.put(
  "/:id/pickup-complete",
  authorizeRole("delivery"),
  upload.single("file"),
  pickupComplete
);
router.put(
  "/:id/delivery-complete",
  authorizeRole("delivery"),
  upload.single("file"),
  deliveryComplete
);

//Admin
router.put("/:id/validate-pickup", authorizeRole("admin"), validatePickup);
router.put("/:id/validate-delivery", authorizeRole("admin"), validateDelivery);
router.get("/tasks", authorizeRole("admin"), listTasks);
router.get("/stats", authorizeRole("delivery"), getRiderStats);
export default router;
