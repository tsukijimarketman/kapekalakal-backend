import { Router } from "express";
import { authenticateToken, authorizeRole } from "../middleware/auth.js";
import {
  listAvailableTasks,
  acceptTask,
  getMyTasks,
  pickupComplete,
  deliveryComplete,
  validateDelivery,
  validatePickup,
  listTasks,
} from "../controllers/deliveryController.js";

const router = Router();

router.use(authenticateToken); // All routes require authentication

//Delivery rider
router.get("/available", authorizeRole("delivery"), listAvailableTasks);
router.post("/:id/accept", authorizeRole("delivery"), acceptTask);
router.get("/my", authorizeRole("delivery"), getMyTasks);
router.put("/:id/pickup-complete", authorizeRole("delivery"), pickupComplete);
router.put(
  "/:id/delivery-complete",
  authorizeRole("delivery"),
  deliveryComplete
);

//Admin
router.put("/:id/validate-pickup", authorizeRole("admin"), validatePickup);
router.put("/:id/validate-delivery", authorizeRole("admin"), validateDelivery);
router.get("/tasks", authorizeRole("admin"), listTasks);
export default router;
