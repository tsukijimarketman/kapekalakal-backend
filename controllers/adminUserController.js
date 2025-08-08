import User from "../models/user.js";

/**
 * ADMIN USER CONTROLLER
 * This controller handles CRUD operations for user management in the admin panel
 */

// CREATE - Add a new user (Admin only)
export async function createUser(req, res) {
  console.log("Admin create user request received:", {
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    email: req.body.email,
    role: req.body.role,
  });

  try {
    const {
      firstName,
      lastName,
      email,
      password,
      role = "user",
      age,
      sex,
      address,
      contactNumber,
      profileImage,
    } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email || !password) {
      console.log("Missing required fields:", {
        firstName,
        lastName,
        email,
        password: password ? "provided" : "missing",
      });
      return res.status(400).json({
        success: false,
        message: "First name, last name, email, and password are required",
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User with this email already exists",
      });
    }

    // Create the user
    const user = await User.create({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.toLowerCase().trim(),
      password, // In production, this should be hashed
      role,
      age: age ? parseInt(age) : undefined,
      sex,
      address: address?.trim(),
      contactNumber: contactNumber?.trim(),
      profileImage: profileImage?.trim(),
    });

    // Remove password from response for security
    const userResponse = user.toObject();
    delete userResponse.password;

    console.log("User created successfully by admin:", user._id);
    res.status(201).json({
      success: true,
      message: "User created successfully",
      data: userResponse,
    });
  } catch (error) {
    console.error("Admin create user error:", error);

    // Handle validation errors from Mongoose
    if (error.name === "ValidationError") {
      const validationErrors = Object.values(error.errors).map(
        (err) => err.message
      );
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: validationErrors,
      });
    }

    // Handle duplicate key error (email already exists)
    if (error.code === 1) {
      return res.status(400).json({
        success: false,
        message: "User with this email already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
}

// READ - Get all users with search and filtering (Admin only)
export async function getAllUsers(req, res) {
  console.log("Admin get all users request received:", req.query);

  try {
    const {
      search = "",
      role = "all",
      sortBy = "lastName",
      sortOrder = "asc",
      page = 1,
      limit = 10,
    } = req.query;

    // Build query object for MongoDB
    const query = {};

    // Add search functionality (search in firstName, lastName, email)
    if (search.trim()) {
      query.$or = [
        { firstName: { $regex: search.trim(), $options: "i" } }, // Case-insensitive search
        { lastName: { $regex: search.trim(), $options: "i" } },
        { email: { $regex: search.trim(), $options: "i" } },
      ];
    }

    // Add role filter
    if (role !== "all") {
      query.role = role;
    }

    // Build sort object
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    // Execute query with pagination (exclude password field for security)
    const users = await User.find(query)
      .select("-password") // Exclude password from results
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum)
      .lean(); // Convert to plain JavaScript objects for better performance

    // Get total count for pagination
    const totalUsers = await User.countDocuments(query);
    const totalPages = Math.ceil(totalUsers / limitNum);

    console.log(`Admin found ${users.length} users out of ${totalUsers} total`);

    res.status(200).json({
      success: true,
      message: "Users retrieved successfully",
      data: {
        users,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalUsers,
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1,
        },
      },
    });
  } catch (error) {
    console.error("Admin get all users error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
}

// READ - Get a single user by ID (Admin only)
export async function getUserById(req, res) {
  console.log("Admin get user by ID request received:", req.params.id);

  try {
    const { id } = req.params;

    const user = await User.findById(id).select("-password"); // Exclude password

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    console.log("Admin found user:", user._id);
    res.status(200).json({
      success: true,
      message: "User retrieved successfully",
      data: user,
    });
  } catch (error) {
    console.error("Admin get user by ID error:", error);

    // Handle invalid ObjectId format
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format",
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
}

// UPDATE - Update a user (Admin only)
export async function updateUser(req, res) {
  console.log("Admin update user request received:", req.params.id, req.body);

  try {
    const { id } = req.params;
    const {
      firstName,
      lastName,
      email,
      role,
      age,
      sex,
      address,
      contactNumber,
      profileImage,
    } = req.body;

    // Find the user first
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if email is being changed and if it's already taken
    if (email && email.toLowerCase() !== user.email) {
      const existingUser = await User.findOne({
        email: email.toLowerCase(),
        _id: { $ne: id }, // Exclude current user from search
      });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "Email is already taken by another user",
        });
      }
    }

    // Prepare update object with only provided fields
    const updateData = {};

    if (firstName !== undefined) updateData.firstName = firstName.trim();
    if (lastName !== undefined) updateData.lastName = lastName.trim();
    if (email !== undefined) updateData.email = email.toLowerCase().trim();
    if (role !== undefined) updateData.role = role;
    if (age !== undefined) updateData.age = age ? parseInt(age) : null;
    if (sex !== undefined) updateData.sex = sex;
    if (address !== undefined) updateData.address = address?.trim();
    if (contactNumber !== undefined)
      updateData.contactNumber = contactNumber?.trim();
    if (profileImage !== undefined)
      updateData.profileImage = profileImage?.trim();

    // Update the user
    const updatedUser = await User.findByIdAndUpdate(id, updateData, {
      new: true, // Return the updated document
      runValidators: true, // Run validation on update
    }).select("-password"); // Exclude password from response

    console.log("User updated successfully by admin:", updatedUser._id);
    res.status(200).json({
      success: true,
      message: "User updated successfully",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Admin update user error:", error);

    // Handle validation errors
    if (error.name === "ValidationError") {
      const validationErrors = Object.values(error.errors).map(
        (err) => err.message
      );
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: validationErrors,
      });
    }

    // Handle invalid ObjectId format
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format",
      });
    }

    // Handle duplicate key error (email already exists)
    if (error.code === 1) {
      return res.status(400).json({
        success: false,
        message: "Email is already taken by another user",
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
}

// DELETE - Delete a user (Admin only)
export async function deleteUser(req, res) {
  console.log("Admin delete user request received:", req.params.id);

  try {
    const { id } = req.params;

    const user = await User.findByIdAndDelete(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    console.log("User deleted successfully by admin:", user._id);
    res.status(200).json({
      success: true,
      message: "User deleted successfully",
      data: { id: user._id },
    });
  } catch (error) {
    console.error("Admin delete user error:", error);

    // Handle invalid ObjectId format
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format",
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
}

// GET - Get user roles (for dropdown/select options in admin panel)
export async function getUserRoles(req, res) {
  console.log("Admin get user roles request received");

  try {
    // Define available roles based on the user schema
    const roles = ["user", "admin", "delivery"];

    console.log("Roles retrieved for admin:", roles);
    res.status(200).json({
      success: true,
      message: "Roles retrieved successfully",
      data: roles,
    });
  } catch (error) {
    console.error("Admin get roles error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
}
