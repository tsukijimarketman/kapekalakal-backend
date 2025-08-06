import mongoose from "mongoose";

const cartItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    max: 99, // Prevent excessive quantities
    default: 1,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  image: {
    type: String,
    trim: true,
  },
  addedAt: {
    type: Date,
    default: Date.now,
  },
});

const cartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    items: {
      type: [cartItemSchema],
      validate: {
        validator: function (items) {
          return items.length <= 50; // Limit cart to 50 items
        },
        message: "Cart cannot contain more than 50 items",
      },
    },
    expiresAt: {
      type: Date,
      default: Date.now,
      expires: 30 * 24 * 60 * 60, // 30 days in seconds
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for total items count
cartSchema.virtual("itemCount").get(function () {
  return this.items.reduce((sum, item) => sum + item.quantity, 0);
});

// Virtual for cart total
cartSchema.virtual("total").get(function () {
  return this.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
});

// Index for better query performance
cartSchema.index({ user: 1 });
cartSchema.index({ updatedAt: 1 });

// Pre-save middleware to update expiresAt on cart updates
cartSchema.pre("save", function (next) {
  if (this.isModified("items")) {
    this.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Reset expiry to 30 days
  }
  next();
});

// Instance method to check if cart is empty
cartSchema.methods.isEmpty = function () {
  return this.items.length === 0;
};

// Instance method to find item by product ID
cartSchema.methods.findItemByProduct = function (productId) {
  return this.items.find(
    (item) => item.product.toString() === productId.toString()
  );
};

// Static method to cleanup expired carts
cartSchema.statics.cleanupExpired = async function () {
  return this.deleteMany({ expiresAt: { $lt: new Date() } });
};

export default mongoose.model("Cart", cartSchema);
