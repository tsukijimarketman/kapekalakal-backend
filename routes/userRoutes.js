// routes/userRoutes.js
import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import User from "../models/user.js";
import multer from "multer";
import cloudinary from "../config/cloudinary.js";

const router = Router();
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB limit
  fileFilter: (req, file, cb) => {
    // Only allow image files
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"), false);
    }
  },
});

router.get("/profile", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password -__v");
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put("/profile", authenticateToken, async (req, res) => {
  try {
    const updateFields = { ...req.body };
    delete updateFields.email;
    delete updateFields.password;

    const user = await User.findByIdAndUpdate(req.user._id, updateFields, {
      new: true,
      runValidators: true,
    }).select("-password -__v");

    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put(
  "/profile-image",
  authenticateToken,
  upload.single("profileImage"),
  async (req, res) => {
    try {
      const userId = req.user._id;

      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, error: "No file uploaded" });
      }

      // Convert buffer to base64 for Cloudinary
      const base64Image = `data:${
        req.file.mimetype
      };base64,${req.file.buffer.toString("base64")}`;

      // Upload to Cloudinary
      const result = await cloudinary.uploader.upload(base64Image, {
        public_id: `profile_${userId}`,
        folder: "profiles",
        overwrite: true,
        resource_type: "image",
        transformation: [
          { width: 400, height: 400, crop: "fill", gravity: "face" },
          { quality: "auto", fetch_format: "auto" },
        ],
      });

      // Update user profile image in MongoDB
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { profileImage: result.secure_url },
        { new: true }
      ).select("-password -__v");

      res.json({
        success: true,
        url: result.secure_url,
        user: updatedUser,
      });
    } catch (error) {
      console.error("Profile image upload error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

export default router;
