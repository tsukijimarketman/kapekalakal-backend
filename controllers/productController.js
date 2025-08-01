import Product from "../models/product.js";

// CREATE - Add a new product
export async function createProduct(req, res) {
  console.log("Create product request received:", {
    name: req.body.name,
    category: req.body.category,
    price: req.body.price,
  });

  try {
    const {
      name,
      description,
      price,
      category,
      image,
      stock = 0,
      isActive: isActiveFromBody = false,
    } = req.body;

    let isActive = isActiveFromBody;

    // Validate required fields
    if (!name || !description || !price || !category || !image) {
      console.log("Missing required fields:", {
        name,
        description,
        price,
        category,
        image,
      });
      return res.status(400).json({
        success: false,
        message: "All required fields must be provided",
      });
    }

    // Validate price is a positive number
    const numericPrice = parseFloat(price);
    if (isNaN(numericPrice) || numericPrice <= 0) {
      return res.status(400).json({
        success: false,
        message: "Price must be a valid positive number",
      });
    }

    if (parseInt(stock) === 0) {
      isActive = false;
    } else {
      isActive = true;
    }

    // Create the product
    const product = await Product.create({
      name: name.trim(),
      description: description.trim(),
      price: numericPrice,
      category,
      image: image.trim(),
      stock: parseInt(stock) || 0,
      isActive,
    });

    console.log("Product created successfully:", product._id);
    res.status(201).json({
      success: true,
      message: "Product created successfully",
      data: product,
    });
  } catch (error) {
    console.error("Create product error:", error);

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

    res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
}

// READ - Get all products with search and filtering
export async function getAllProducts(req, res) {
  console.log("Get all products request received:", req.query);

  try {
    const {
      search = "",
      category = "all",
      sortBy = "createdAt",
      sortOrder = "desc",
      page = 1,
      limit = 10,
    } = req.query;

    // Build query object
    const query = {};

    // Add search functionality
    if (search.trim()) {
      query.$or = [
        { name: { $regex: search.trim(), $options: "i" } },
        { description: { $regex: search.trim(), $options: "i" } },
      ];
    }

    // Add category filter
    if (category !== "all") {
      query.category = category;
    }

    // Build sort object
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    // Execute query with pagination
    const products = await Product.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum)
      .lean(); // Convert to plain JavaScript objects for better performance

    // Get total count for pagination
    const totalProducts = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalProducts / limitNum);

    console.log(
      `Found ${products.length} products out of ${totalProducts} total`
    );

    res.status(200).json({
      success: true,
      message: "Products retrieved successfully",
      data: {
        products,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalProducts,
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1,
        },
      },
    });
  } catch (error) {
    console.error("Get all products error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
}

// READ - Get a single product by ID
export async function getProductById(req, res) {
  console.log("Get product by ID request received:", req.params.id);

  try {
    const { id } = req.params;

    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    console.log("Product found:", product._id);
    res.status(200).json({
      success: true,
      message: "Product retrieved successfully",
      data: product,
    });
  } catch (error) {
    console.error("Get product by ID error:", error);

    // Handle invalid ObjectId format
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID format",
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
}

// UPDATE - Update a product
export async function updateProduct(req, res) {
  console.log("Update product request received:", {
    id: req.params.id,
    updates: req.body,
  });

  try {
    const { id } = req.params;
    const { name, description, price, category, image, stock, isActive } =
      req.body;

    // Find the product first
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Prepare update object with only provided fields
    const updateData = {};

    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description.trim();
    if (price !== undefined) {
      const numericPrice = parseFloat(price);
      if (isNaN(numericPrice) || numericPrice <= 0) {
        return res.status(400).json({
          success: false,
          message: "Price must be a valid positive number",
        });
      }
      updateData.price = numericPrice;
    }
    if (category !== undefined) updateData.category = category;
    if (image !== undefined) updateData.image = image.trim();
    if (stock !== undefined) updateData.stock = parseInt(stock) || 0;
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);

    if (parseInt(stock) === 0) {
      updateData.isActive = false;
    } else {
      updateData.isActive = true;
    }

    // Update the product
    const updatedProduct = await Product.findByIdAndUpdate(id, updateData, {
      new: true, // Return the updated document
      runValidators: true, // Run validation on update
    });

    console.log("Product updated successfully:", updatedProduct._id);
    res.status(200).json({
      success: true,
      message: "Product updated successfully",
      data: updatedProduct,
    });
  } catch (error) {
    console.error("Update product error:", error);

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
        message: "Invalid product ID format",
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
}

// DELETE - Delete a product
export async function deleteProduct(req, res) {
  console.log("Delete product request received:", req.params.id);

  try {
    const { id } = req.params;

    const product = await Product.findByIdAndDelete(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    console.log("Product deleted successfully:", product._id);
    res.status(200).json({
      success: true,
      message: "Product deleted successfully",
      data: { id: product._id },
    });
  } catch (error) {
    console.error("Delete product error:", error);

    // Handle invalid ObjectId format
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID format",
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
}

// GET - Get product categories (for dropdown/select options)
export async function getProductCategories(req, res) {
  console.log("Get product categories request received");

  try {
    // Get unique categories from existing products
    const categories = await Product.distinct("category");

    // Sort categories alphabetically
    const sortedCategories = categories.sort();

    console.log("Categories retrieved:", categories);
    res.status(200).json({
      success: true,
      message: "Categories retrieved successfully",
      data: sortedCategories,
    });
  } catch (error) {
    console.error("Get categories error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
}
