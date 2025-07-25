import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";

//load environment variables
dotenv.config();
connectDB();

//middleware
const app = express();

// CORS configuration
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:5173",
      process.env.CLIENT_URL,
    ].filter(Boolean), // Remove any undefined values
    credentials: true, // Allow cookies to be sent
  })
);

app.use(express.json());
app.use(cookieParser()); // Add cookie parser middleware

app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);

//set the port
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
