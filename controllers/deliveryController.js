import Transaction from "../models/transaction.js";

// Fixed delivery fee (PHP)
export const FIXED_DELIVERY_FEE = 50;

// UTIL: push a status history entry (helper)
const pushStatusHistory = (doc, status, userId) => {
  if (!doc.statusHistory) doc.statusHistory = [];
  doc.statusHistory.push({ status, updatedBy: userId, timestamp: new Date() });
};

// RIDER: list available tasks to accept (unassigned in_transit)
// GET /api/delivery/available
export const listAvailableTasks = async (req, res) => {
  try {
    const tasks = await Transaction.find({
      status: "in_transit",
      "deliveryInfo.assignedDeliveryId": { $exists: false },
    })
      .sort({ createdAt: -1 })
      .select(
        "transactionId items itemsSubtotal totalAmount shippingAddress status deliveryInfo.latitude deliveryInfo.longitude createdAt"
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

    // Atomic self-assign: only if currently unassigned and in_transit
    const updated = await Transaction.findOneAndUpdate(
      {
        _id: id,
        status: "in_transit",
        $or: [
          { "deliveryInfo.assignedDeliveryId": { $exists: false } },
          { "deliveryInfo.assignedDeliveryId": null },
        ],
      },
      {
        $set: { "deliveryInfo.assignedDeliveryId": riderId },
        $push: {
          statusHistory: {
            status: "rider_accepted",
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

    // TODO: handle Cloudinary upload and set deliveryInfo.pickupPhoto
    const doc = await Transaction.findOne({
      _id: id,
      "deliveryInfo.assignedDeliveryId": riderId,
    });

    if (!doc)
      return res.status(404).json({ ok: false, message: "Task not found." });

    doc.deliveryInfo = doc.deliveryInfo || {};
    // doc.deliveryInfo.pickupPhoto = uploadedUrl; // to be set when Cloudinary is added
    doc.deliveryInfo.pickupCompletedAt = new Date();
    pushStatusHistory(doc, "pickup_completed", riderId);
    await doc.save();

    return res
      .status(200)
      .json({ ok: true, message: "Pickup marked complete." });
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

    // TODO: handle Cloudinary upload and set deliveryInfo.deliveryPhoto
    const doc = await Transaction.findOne({
      _id: id,
      "deliveryInfo.assignedDeliveryId": riderId,
    });

    if (!doc)
      return res.status(404).json({ ok: false, message: "Task not found." });

    doc.deliveryInfo = doc.deliveryInfo || {};
    // doc.deliveryInfo.deliveryPhoto = uploadedUrl; // to be set when Cloudinary is added
    doc.deliveryInfo.deliveredAt = new Date();
    pushStatusHistory(doc, "delivery_completed", riderId);
    await doc.save();

    return res.status(200).json({
      ok: true,
      message: "Delivery marked complete (awaiting admin validation).",
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
