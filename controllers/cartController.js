import Cart from "../models/cart.js";
import Product from "../models/product.js";

// Get user's cart
export const getCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user.id }).populate(
      "items.product",
      "name price image stock"
    );
    if (!cart) {
      return res.status(200).json({
        success: true,
        data: { items: [], itemCount: 0, total: 0 },
      });
    }

    // Calculate totals
    const itemCount = cart.items.length;
    const total = cart.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    res.json({
      success: true,
      data: {
        ...cart.toObject(),
        itemCount,
        total,
      },
    });
  } catch (error) {
    console.error("Get cart error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve cart",
    });
  }
};

// Add item to cart
export const addToCart = async (req, res) => {
  const { productId, quantity = 1 } = req.body;

  // Input validation
  if (!productId) {
    return res.status(400).json({
      success: false,
      message: "Product ID is required",
    });
  }

  if (!Number.isInteger(quantity) || quantity < 1) {
    return res.status(400).json({
      success: false,
      message: "Quantity must be a positive integer",
    });
  }

  try {
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Check stock availability
    if (product.stock < quantity) {
      return res.status(400).json({
        success: false,
        message: `Only ${product.stock} items available in stock`,
      });
    }

    let cart = await Cart.findOne({ user: req.user.id });

    if (!cart) {
      cart = new Cart({
        user: req.user.id,
        items: [
          {
            product: productId,
            quantity,
            price: product.price,
            name: product.name,
            image: product.image,
          },
        ],
      });
    } else {
      const itemIndex = cart.items.findIndex(
        (item) => item.product.toString() === productId
      );

      if (itemIndex > -1) {
        const newQuantity = cart.items[itemIndex].quantity + quantity;

        // Check total quantity against stock
        if (newQuantity > product.stock) {
          return res.status(400).json({
            success: false,
            message: `Cannot add ${quantity} more items. Only ${
              product.stock - cart.items[itemIndex].quantity
            } available`,
          });
        }

        cart.items[itemIndex].quantity = newQuantity;
      } else {
        cart.items.push({
          product: productId,
          quantity,
          price: product.price,
          name: product.name,
          image: product.image,
        });
      }
    }

    const savedCart = await cart.save();
    res.status(200).json({
      success: true,
      message: "Item added to cart successfully",
      data: savedCart,
    });
  } catch (error) {
    console.error("Add to cart error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add item to cart",
    });
  }
};

// Update cart item quantity
export const updateCartItem = async (req, res) => {
  const { itemId } = req.params;
  const { quantity } = req.body;

  // Input validation
  if (!Number.isInteger(quantity) || quantity < 0) {
    return res.status(400).json({
      success: false,
      message: "Quantity must be a non-negative integer",
    });
  }

  try {
    const cart = await Cart.findOne({ user: req.user.id });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    const itemIndex = cart.items.findIndex(
      (item) => item._id.toString() === itemId
    );

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Item not found in cart",
      });
    }

    if (quantity === 0) {
      cart.items.splice(itemIndex, 1);
    } else {
      // Check stock availability for the product
      const product = await Product.findById(cart.items[itemIndex].product);
      if (product && quantity > product.stock) {
        return res.status(400).json({
          success: false,
          message: `Only ${product.stock} items available in stock`,
        });
      }

      cart.items[itemIndex].quantity = quantity;
    }

    const updatedCart = await cart.save();
    res.json({
      success: true,
      message:
        quantity === 0 ? "Item removed from cart" : "Cart updated successfully",
      data: updatedCart,
    });
  } catch (error) {
    console.error("Update cart error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update cart",
    });
  }
};

// Remove item from cart
export const removeFromCart = async (req, res) => {
  const { itemId } = req.params;

  try {
    const cart = await Cart.findOne({ user: req.user.id });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    const itemIndex = cart.items.findIndex(
      (item) => item._id.toString() === itemId
    );

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Item not found in cart",
      });
    }

    cart.items.splice(itemIndex, 1);
    const updatedCart = await cart.save();

    res.json({
      success: true,
      message: "Item removed from cart successfully",
      data: updatedCart,
    });
  } catch (error) {
    console.error("Remove from cart error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to remove item from cart",
    });
  }
};

// Clear cart
export const clearCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user.id });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    cart.items = [];
    await cart.save();

    res.json({
      success: true,
      message: "Cart cleared successfully",
    });
  } catch (error) {
    console.error("Clear cart error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to clear cart",
    });
  }
};

export default {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
};
