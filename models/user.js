import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ["user", "admin", "delivery"],
      default: "user",
    },

    // Optional profile fields
    age: { type: Number },
    sex: { type: String, enum: ["Male", "Female", "Other"], required: false },
    address: { type: String },
    contactNumber: { type: String },
    profileImage: { type: String }, // Can be base64 or URL

    // Rider-specific stats (for delivery role)
    riderStats: {
      lifetimeEarnings: { type: Number, default: 0 },
      totalDeliveries: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
