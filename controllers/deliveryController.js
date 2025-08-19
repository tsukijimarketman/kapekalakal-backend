import Transaction from "../models/transaction.js";
import User from "../models/user.js";
import cloudinary from "../config/cloudinary.js";

// Fixed delivery fee (PHP)
export const FIXED_DELIVERY_FEE = 50;

// UTIL: push a status history entry (helper)
const pushStatusHistory = (doc, status, userId) => {
  if (!doc.statusHistory) doc.statusHistory = [];
  doc.statusHistory.push({ status, updatedBy: userId, timestamp: new Date() });
};

// RIDER: list available tasks to accept (unassigned tasks with status 'to_receive')
// GET /api/delivery/available
export const listAvailableTasks = async (req, res) => {
  try {
    const tasks = await Transaction.find({
      status: "to_receive",
      $or: [
        { "deliveryInfo.assignedDeliveryId": { $exists: false } },
        { "deliveryInfo.assignedDeliveryId": null },
      ],
    })
      .sort({ createdAt: -1 })
      .select(
        "transactionId items itemsSubtotal totalAmount shippingAddress status deliveryInfo.latitude deliveryInfo.longitude deliveryInfo.estimatedDelivery createdAt"
      )
      .lean();

    // Attach fixed fee information (not persisted yet)
    const withFee = tasks.map((t) => ({
      ...t,
      deliveryFee: FIXED_DELIVERY_FEE,
    }));
    return res.status(200).json({ ok: true, data: withFee });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
};

// RIDER: accept a task (self-assign)
// POST /api/delivery/:id/accept
export const acceptTask = async (req, res) => {
  try {
    const { id } = req.params; // transaction _id
    const riderId = req.user._id;

    // Enforce one active task per rider
    const existingActive = await Transaction.findOne({
      "deliveryInfo.assignedDeliveryId": riderId,
      status: { $in: ["in_transit", "In Transit"] },
    }).lean();
    if (existingActive) {
      return res
        .status(409)
        .json({ ok: false, message: "You already have an active task." });
    }

    // Atomic self-assign: only if currently unassigned and in_transit
    const updated = await Transaction.findOneAndUpdate(
      {
        _id: id,
        $or: [
          { "deliveryInfo.assignedDeliveryId": { $exists: false } },
          { "deliveryInfo.assignedDeliveryId": null },
        ],
      },
      {
        $set: {
          status: "in_transit",
          "deliveryInfo.assignedDeliveryId": riderId,
          "deliveryInfo.assignedAt": new Date(),
        },
        $push: {
          statusHistory: {
            status: "in_transit",
            updatedBy: riderId,
            timestamp: new Date(),
          },
        },
      },
      { new: true }
    ).lean();

    if (!updated) {
      return res.status(409).json({
        ok: false,
        message: "Task no longer available or already assigned.",
      });
    }

    return res
      .status(200)
      .json({ ok: true, message: "Task accepted.", data: updated });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
};

// RIDER: my tasks
// GET /api/delivery/my
export const getMyTasks = async (req, res) => {
  try {
    const riderId = req.user._id;
    const tasks = await Transaction.find({
      "deliveryInfo.assignedDeliveryId": riderId,
      status: { $in: ["in_transit", "completed"] },
    })
      .populate("customerId", "firstName lastName contactNumber")
      .sort({ createdAt: -1 })
      .lean();

    const withFee = tasks.map((t) => ({
      ...t,
      deliveryFee: FIXED_DELIVERY_FEE,
    }));
    return res.status(200).json({ ok: true, data: withFee });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
};

// RIDER: mark pickup complete (multipart to be added later)
// PUT /api/delivery/:id/pickup-complete
export const pickupComplete = async (req, res) => {
  try {
    const { id } = req.params;
    const riderId = req.user._id;

    // Verify task belongs to rider
    const doc = await Transaction.findOne({
      _id: id,
      "deliveryInfo.assignedDeliveryId": riderId,
    });

    if (!doc)
      return res.status(404).json({ ok: false, message: "Task not found." });

    // Validate file presence (multer memoryStorage places it in req.file)
    if (!req.file) {
      return res.status(400).json({ ok: false, message: "No file uploaded" });
    }

    // Convert buffer to base64 and upload to Cloudinary
    const base64Image = `data:${
      req.file.mimetype
    };base64,${req.file.buffer.toString("base64")}`;
    const publicId = `pProof_${riderId}_${id}`;
    const uploadResult = await cloudinary.uploader.upload(base64Image, {
      public_id: publicId,
      folder: "delivery_rider",
      overwrite: true,
      resource_type: "image",
      transformation: [{ quality: "auto", fetch_format: "auto" }],
    });

    doc.deliveryInfo = doc.deliveryInfo || {};
    doc.deliveryInfo.pickupPhoto = uploadResult.secure_url;
    doc.deliveryInfo.pickupCompletedAt = new Date();
    pushStatusHistory(doc, "pickup_completed", riderId);
    await doc.save();

    return res.status(200).json({
      ok: true,
      message: "Pickup marked complete.",
      photoUrl: uploadResult.secure_url,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
};

// RIDER: mark delivery complete (multipart to be added later)
// PUT /api/delivery/:id/delivery-complete
export const deliveryComplete = async (req, res) => {
  try {
    const { id } = req.params;
    const riderId = req.user._id;

    // Verify task belongs to rider
    const doc = await Transaction.findOne({
      _id: id,
      "deliveryInfo.assignedDeliveryId": riderId,
    });

    if (!doc)
      return res.status(404).json({ ok: false, message: "Task not found." });

    if (!req.file) {
      return res.status(400).json({ ok: false, message: "No file uploaded" });
    }

    const base64Image = `data:${
      req.file.mimetype
    };base64,${req.file.buffer.toString("base64")}`;
    const publicId = `dProof_${riderId}_${id}`;
    const uploadResult = await cloudinary.uploader.upload(base64Image, {
      public_id: publicId,
      folder: "delivery_rider",
      overwrite: true,
      resource_type: "image",
      transformation: [{ quality: "auto", fetch_format: "auto" }],
    });

    doc.deliveryInfo = doc.deliveryInfo || {};
    doc.deliveryInfo.deliveryPhoto = uploadResult.secure_url;
    doc.deliveryInfo.deliveredAt = new Date();
    pushStatusHistory(doc, "delivery_completed", riderId);
    await doc.save();

    return res.status(200).json({
      ok: true,
      message: "Delivery marked complete (awaiting admin validation).",
      photoUrl: uploadResult.secure_url,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
};

// ADMIN: validate pickup
// PUT /api/delivery/:id/validate-pickup
export const validatePickup = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user._id;

    const doc = await Transaction.findById(id);
    if (!doc)
      return res
        .status(404)
        .json({ ok: false, message: "Transaction not found." });

    doc.deliveryInfo = doc.deliveryInfo || {};
    doc.deliveryInfo.adminValidatedPickupAt = new Date();
    doc.deliveryInfo.pickupValidated = true;
    pushStatusHistory(doc, "pickup_validated", adminId);
    await doc.save();

    return res.status(200).json({ ok: true, message: "Pickup validated." });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
};

// ADMIN: validate delivery (finalize completed)
// PUT /api/delivery/:id/validate-delivery
export const validateDelivery = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user._id;

    const doc = await Transaction.findById(id);
    if (!doc)
      return res
        .status(404)
        .json({ ok: false, message: "Transaction not found." });

    doc.deliveryInfo = doc.deliveryInfo || {};
    doc.deliveryInfo.adminValidatedDeliveryAt = new Date();
    doc.deliveryInfo.deliveryValidated = true;
    doc.status = "completed";
    pushStatusHistory(doc, "completed", adminId);
    await doc.save();

    // Persist rider earnings upon final admin validation
    const riderId = doc.deliveryInfo?.assignedDeliveryId;
    if (riderId) {
      await User.findByIdAndUpdate(riderId, {
        $inc: {
          "riderStats.lifetimeEarnings": FIXED_DELIVERY_FEE,
          "riderStats.totalDeliveries": 1,
        },
      });
    }

    return res.status(200).json({
      ok: true,
      message: "Delivery validated and transaction completed.",
    });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
};

// ADMIN: list tasks (basic filter by status and assignment)
// GET /api/delivery/tasks?status=in_transit&assigned=true|false
export const listTasks = async (req, res) => {
  try {
    const { status, assigned } = req.query;

    const filter = {};
    if (status) filter.status = status;

    if (assigned === "true") {
      filter["deliveryInfo.assignedDeliveryId"] = { $exists: true, $ne: null };
    } else if (assigned === "false") {
      filter["deliveryInfo.assignedDeliveryId"] = { $exists: false };
    }

    const tasks = await Transaction.find(filter).sort({ createdAt: -1 }).lean();
    return res.status(200).json({ ok: true, data: tasks });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
};

export const getRiderStats = async (req, res) => {
  try {
    const riderId = req.user._id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    //Get total deliveries
    const totalDeliveries = await Transaction.countDocuments({
      "deliveryInfo.assignedDeliveryId": riderId,
      status: "completed",
    });

    //Get total deliveries
    const todayDeliveries = await Transaction.countDocuments({
      "deliveryInfo.assignedDeliveryId": riderId,
      status: "completed",
      updatedAt: { $gte: today },
    });

    //Load persisted stats, fallback to computed
    const rider = await User.findById(riderId).select("riderStats").lean();
    const totalEarnings =
      rider?.riderStats?.lifetimeEarnings ??
      totalDeliveries * FIXED_DELIVERY_FEE;
    const todayEarnings = todayDeliveries * FIXED_DELIVERY_FEE;

    //Get recent activity (last 5 deliveries)
    const recentActivity = await Transaction.find({
      "deliveryInfo.assignedDeliveryId": riderId,
    })
      .sort({ updatedAt: -1 })
      .limit(5)
      .select("transactionId status updatedAt deliveryInfo.status")
      .lean();

    res.json({
      ok: true,
      data: {
        totalDeliveries,
        todayDeliveries,
        totalEarnings,
        todayEarnings,
        recentActivity,
      },
    });
  } catch (error) {
    console.error("Error getting rider stats: ", error);
    return res.status(500).json({ ok: false, message: error.message });
  }
};
