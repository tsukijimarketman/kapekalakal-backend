// routes/userRoutes.js
import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import User from "../models/user.js";
import multer from "multer";
import cloudinary from "../config/cloudinary.js";
import bcrypt from "bcrypt";

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
    const {
      firstName,
      lastName,
      age,
      sex,
      address,
      contactNumber,
      currentPassword,
      newPassword,
      confirmPassword,
    } = req.body;

    const updateFields = {};
    let shouldUpdatePassword = false;

    // Handle profile fields
    if (firstName !== undefined) updateFields.firstName = firstName;
    if (lastName !== undefined) updateFields.lastName = lastName;
    if (age !== undefined) updateFields.age = age;
    if (sex !== undefined) updateFields.sex = sex;
    if (address !== undefined) updateFields.address = address;
    if (contactNumber !== undefined) updateFields.contactNumber = contactNumber;

    // Handle password change
    if (currentPassword && newPassword && confirmPassword) {
      shouldUpdatePassword = true;

      // Validate password confirmation
      if (newPassword !== confirmPassword) {
        return res.status(400).json({
          success: false,
          error: "New password and confirm password do not match",
        });
      }

      // Validate new password strength
      const passwordRegex =
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
      if (!passwordRegex.test(newPassword)) {
        return res.status(400).json({
          success: false,
          error:
            "Password must be at least 8 characters long and contain at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character",
        });
      }

      // Get user with password for verification
      const user = await User.findById(req.user._id);
      if (!user) {
        return res
          .status(404)
          .json({ success: false, error: "User not found" });
      }

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(
        currentPassword,
        user.password
      );
      if (!isCurrentPasswordValid) {
        return res.status(400).json({
          success: false,
          error: "Current password is incorrect",
        });
      }

      // Hash new password
      const hashedNewPassword = await bcrypt.hash(newPassword, 10);
      updateFields.password = hashedNewPassword;
    }

    // Update user
    const user = await User.findByIdAndUpdate(req.user._id, updateFields, {
      new: true,
      runValidators: true,
    }).select("-password -__v");

    res.json({
      success: true,
      user,
      message: shouldUpdatePassword
        ? "Profile and password updated successfully"
        : "Profile updated successfully",
    });
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

router.put("/change-password", authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Validate required fields
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: "Current password and new password are required",
      });
    }

    // Get user with password
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password
    );
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        error: "Current password is incorrect",
      });
    }

    // Validate new password strength
    const passwordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({
        success: false,
        error:
          "Password must be at least 8 characters long and contain at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character",
      });
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await User.findByIdAndUpdate(req.user._id, { password: hashedNewPassword });

    res.json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
