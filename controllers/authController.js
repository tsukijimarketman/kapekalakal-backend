import User from "../models/user.js";
import { hash } from "bcrypt";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

export async function signup(req, res) {
  const {
    firstName,
    lastName,
    email,
    password,
    age = null,
    sex = "",
    address = "",
    contactNumber = "",
    profileImage = "",
  } = req.body;

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: "Email already exists!" });

    const hashedPassword = await hash(password, 10);

    const user = await User.create({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      age,
      sex,
      address,
      contactNumber,
      profileImage,
    });

    res.status(201).json({ message: "User created successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
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

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

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
    res.clearCookie("token");
    res.status(200).json({ message: "Signed out successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
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
