import User from "../models/user.js";
import { hash } from "bcrypt";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

export async function signup(req, res) {
  console.log("Signup request received:", {
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    email: req.body.email,
    hasPassword: !!req.body.password,
  });

  const {
    firstName,
    lastName,
    email,
    password,
    age = null,
    sex,
    address = "",
    contactNumber = "",
    profileImage = "",
  } = req.body;

  try {
    // Validate required fields
    if (!firstName || !lastName || !email || !password) {
      console.log("Missing required fields:", {
        firstName,
        lastName,
        email,
        hasPassword: !!password,
      });
      return res.status(400).json({
        success: false,
        message: "All required fields must be provided",
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log("Email already exists:", email);
      return res
        .status(400)
        .json({ success: false, message: "Email already exists!" });
    }

    const hashedPassword = await hash(password, 10);

    // Prepare user data, excluding sex if it's empty
    const userData = {
      firstName,
      lastName,
      email,
      password: hashedPassword,
      age,
      address,
      contactNumber,
      profileImage,
    };

    // Only add sex if it has a valid value
    if (sex && ["Male", "Female", "Other"].includes(sex)) {
      userData.sex = sex;
    }

    const user = await User.create(userData);

    console.log("User created successfully:", user._id);
    res
      .status(201)
      .json({ success: true, message: "User created successfully" });
  } catch (error) {
    console.error("Signup error:", error);
    res
      .status(500)
      .json({ success: false, message: error.message || "Server error" });
  }
}

export async function signin(req, res) {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ message: "Invalid email or password" });

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch)
      return res.status(400).json({ message: "Invalid email or password" });

    const token = jwt.sign(
      {
        userId: user._id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    const isProduction = process.env.NODE_ENV === "production";
    res.cookie("token", token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: "/",
      domain: isProduction ? ".onrender.com" : undefined
    });

    res.status(200).json({
      user: {
        id: user._id,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        token,
      },
      redirectTo: getRoleBasedRedirect(user.role),
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
}

export async function verifyToken(req, res) {
  try {
    const user = req.user;
    res.status(200).json({
      user: {
        id: user._id,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
      },
      redirectTo: getRoleBasedRedirect(user.role),
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
}

export async function signout(req, res) {
  try {
    const isProduction = process.env.NODE_ENV === "production";
    res.clearCookie("token", {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      path: "/",
      domain: isProduction ? ".onrender.com" : undefined
    });
    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Signout error:", error);
    res.status(500).json({ message: "Server error during signout" });
  }
}

function getRoleBasedRedirect(role) {
  switch (role) {
    case "admin":
      return "/admin";
    case "delivery":
      return "/delivery";
    case "user":
      return "/user";
    default:
      return "/user";
  }
}
