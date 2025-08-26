import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import adminUserRoutes from "./routes/adminUserRoutes.js";
import transactionRoutes from "./routes/transactionRoutes.js";
import cartRoutes from "./routes/cartRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import stripeRoutes from "./routes/stripeRoutes.js";
import deliveryRoutes from "./routes/deliveryRoutes.js";

//load environment variables
dotenv.config();
connectDB();

//middleware
const app = express();

// CORS configuration with enhanced security and debugging
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "https://kapekalakal-frontend-nu4g.onrender.com",
  process.env.CLIENT_URL,
].filter(Boolean);

// Enable CORS with credentials support
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Expose-Headers', 'set-cookie');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

app.use(express.json());
app.use(cookieParser()); // Add cookie parser middleware

app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/products", productRoutes);
app.use("/api/admin/users", adminUserRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/stripe", stripeRoutes);
app.use("/api/delivery", deliveryRoutes);

//set the port
const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
