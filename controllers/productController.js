// backend/controllers/productController.js
import Product from '../models/Product.js';
import mongoose from 'mongoose';

// Get all products
export const getProducts = async (req, res) => {
  try {
    const { category, lowStock, search, page = 1, limit = 20 } = req.query;
    
    const filter = { branch: req.user.branch._id };
    
    if (category && category !== 'all') filter.category = category;
    if (lowStock === 'true') filter.stock = { $lte: 10 };
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const products = await Product.find(filter)
      .sort({ name: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Product.countDocuments(filter);

    res.json({
      success: true,
      data: {
        products,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products'
    });
  }
};

// Get single product
export const getProduct = async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      branch: req.user.branch._id
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      data: product
    });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch product'
    });
  }
};

// Create product - ENHANCED with better category handling
export const createProduct = async (req, res) => {
  try {
    const { name, description, price, cost, category, stock, minStock, isAvailable, image } = req.body;
    
    console.log('Creating product with data:', req.body); // Debug log

    // Basic validation
    if (!name || !price || !category) {
      return res.status(400).json({
        success: false,
        message: 'Name, price, and category are required'
      });
    }

    // Clean and validate category
    const cleanCategory = category.toString().trim();
    if (!cleanCategory) {
      return res.status(400).json({
        success: false,
        message: 'Category cannot be empty'
      });
    }

    const productData = {
      name: name.toString().trim(),
      description: description ? description.toString().trim() : '',
      price: parseFloat(price),
      cost: cost ? parseFloat(cost) : 0,
      category: cleanCategory,
      stock: stock ? parseInt(stock) : 0,
      minStock: minStock ? parseInt(minStock) : 10,
      isAvailable: isAvailable !== false,
      image: image || '',
      branch: req.user.branch._id
    };

    console.log('Processed product data:', productData); // Debug log

    const product = new Product(productData);
    await product.save();

    // Emit real-time event
    if (req.io) {
      req.io.to(`branch-${req.user.branch._id}`).emit('product-created', product);
      req.io.to(`pos-${req.user.branch._id}`).emit('product-added', product);
    }

    res.status(201).json({
      success: true,
      data: product,
      message: 'Product created successfully'
    });
  } catch (error) {
    console.error('Create product error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: Object.values(error.errors).map(e => e.message)
      });
    }
    res.status(500).json({
      success: false,
      message: 'Failed to create product'
    });
  }
};

// Update product
export const updateProduct = async (req, res) => {
  try {
    const { name, description, price, cost, category, stock, minStock, isAvailable, image } = req.body;
    
    const updateData = {
      ...(name && { name: name.toString().trim() }),
      ...(description !== undefined && { description: description.toString().trim() }),
      ...(price && { price: parseFloat(price) }),
      ...(cost !== undefined && { cost: parseFloat(cost) }),
      ...(category && { category: category.toString().trim() }),
      ...(stock !== undefined && { stock: parseInt(stock) }),
      ...(minStock !== undefined && { minStock: parseInt(minStock) }),
      ...(isAvailable !== undefined && { isAvailable: isAvailable }),
      ...(image !== undefined && { image: image })
    };

    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, branch: req.user.branch._id },
      updateData,
      { new: true, runValidators: true }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Emit real-time event
    if (req.io) {
      req.io.to(`branch-${req.user.branch._id}`).emit('product-updated', product);
      req.io.to(`pos-${req.user.branch._id}`).emit('product-modified', product);
    }

    res.json({
      success: true,
      data: product,
      message: 'Product updated successfully'
    });
  } catch (error) {
    console.error('Update product error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: Object.values(error.errors).map(e => e.message)
      });
    }
    res.status(500).json({
      success: false,
      message: 'Failed to update product'
    });
  }
};

// Delete product
export const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findOneAndDelete({
      _id: req.params.id,
      branch: req.user.branch._id
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Emit real-time event
    if (req.io) {
      req.io.to(`branch-${req.user.branch._id}`).emit('product-deleted', product);
      req.io.to(`pos-${req.user.branch._id}`).emit('product-removed', product);
    }

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete product'
    });
  }
};

// Update stock
export const updateStock = async (req, res) => {
  try {
    const { stock } = req.body;
    
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, branch: req.user.branch._id },
      { stock: parseInt(stock) },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Emit real-time event for stock update
    if (req.io) {
      req.io.to(`branch-${req.user.branch._id}`).emit('stock-updated', {
        productId: product._id,
        stock: product.stock,
        branch: req.user.branch._id
      });
    }

    res.json({
      success: true,
      data: product,
      message: 'Stock updated successfully'
    });
  } catch (error) {
    console.error('Update stock error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update stock'
    });
  }
};

// Get categories - ENHANCED to handle dynamic categories
export const getCategories = async (req, res) => {
  try {
    const categories = await Product.distinct('category', {
      branch: req.user.branch._id
    });

    // Sort categories alphabetically and ensure they're unique
    const uniqueCategories = [...new Set(categories)]
      .filter(cat => cat && cat.trim()) // Remove empty categories
      .sort();

    console.log('Fetched categories:', uniqueCategories); // Debug log

    res.json({
      success: true,
      data: uniqueCategories
    });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories'
    });
  }
};

// Get low stock products
export const getLowStockProducts = async (req, res) => {
  try {
    const products = await Product.find({
      branch: req.user.branch._id,
      stock: { $lte: 10 }
    }).sort({ stock: 1 });

    res.json({
      success: true,
      data: products
    });
  } catch (error) {
    console.error('Get low stock products error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch low stock products'
    });
  }
};