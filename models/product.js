import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
      maxlength: [100, "Product name cannot exceed 100 characters"],
    },
    description: {
      type: String,
      required: [true, "Product description is required"],
      trim: true,
      maxlength: [500, "Product description cannot exceed 500 characters"],
    },
    price: {
      type: Number,
      required: [true, "Product price is required"],
      min: [0, "Price cannot be negative"],
      max: [999999, "Price cannot exceed 999,999"],
    },
    category: {
      type: String,
      required: [true, "Product category is required"],
      enum: {
        values: ["coffee", "tea", "equipment", "accessories"],
        message: "Category must be one of: coffee, tea, equipment, accessories",
      },
    },
    image: {
      type: String,
      required: [true, "Product image is required"],
      trim: true,
    },
    // Optional fields for future expansion
    stock: {
      type: Number,
      default: 0,
      min: [0, "Stock cannot be negative"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true } // This automatically adds createdAt and updatedAt fields
);

// Create indexes for better search performance
productSchema.index({ name: "text", description: "text" });
productSchema.index({ category: 1 });
productSchema.index({ price: 1 });

// Virtual field for formatted price (not stored in database)
productSchema.virtual("formattedPrice").get(function () {
  return `₱${this.price.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
});

// Ensure virtual fields are included when converting to JSON
productSchema.set("toJSON", { virtuals: true });
productSchema.set("toObject", { virtuals: true });

export default mongoose.model("Product", productSchema);
