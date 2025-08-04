import mongoose from "mongoose";

//Transaction Schema - THis handles all e-commerce orders/transactions
const transactionSchema = new mongoose.Schema(
  {
    //Unique transaction Identifier
    transactionId: {
      type: String,
      unique: true,
      required: true,
      default: () =>
        `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    },

    //Reference to the customer who made this transaction
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    //Array of products in this transaction
    items: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        name: { type: String, required: true }, //Store product name for history
        price: { type: Number, required: true }, //Price at time of purchase
        quantity: { type: Number, required: true, min: 1 },
        subtotal: { type: Number, required: true }, //price*quantity
      },
    ],

    //Financtial calculations
    itemsSubtotal: { type: Number, required: true }, //Sum of all item subtotals
    vat: { type: Number, required: true }, //8% of itemsSubtotal
    shippingFee: { type: Number, required: true, default: 120 },
    totalAmount: { type: Number, required: true }, //imtesSubtotal + vat + shippingFee

    //Payment and delivvery information
    paymentMethod: {
      type: String,
      enum: ["COD", "Paymongo"],
      required: true,
    },
    shippingAddress: {
      type: String,
      required: true,
    },

    //Order status workflow
    status: {
      type: String,
      enum: ["to_pay", "to_receive", "in_transit", "completed", "cancelled"],
    },

    //Delivery workflow information
    deliveryInfo: {
      assignedDeliveryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      pickupPhoto: { type: String }, //Cloudinary URL for pickup photo folder
      deliveryPhoto: { type: String }, //Cloudinary URL for delivery photo folder
      pickupValidated: { type: Boolean, default: false }, //Admin validation
      deliveryValidated: { type: Boolean, default: false }, //Admin validation
      estimatedDelivery: { type: Date }, //2 Days from checkout
    },

    //Cancellation logic (5 minute window)
    cancellationDeadline: { type: Date }, //5 minutes after checkout
    canCancel: { type: Boolean, default: true },
    cancellationReason: { type: String },
    cancellationDate: { type: Date },

    //Track all status changes for audit trail
    statusHistory: [
      {
        status: String,
        timestamp: { type: Date, default: Date.now },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      },
    ],
  },
  { timestamps: true }
);

//Create indexes for better query performances
transactionSchema.index({ customerId: 1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ transactionId: 1 });

//Export the Transaction model
const Transaction = mongoose.model("Transaction", transactionSchema);
export default Transaction;
