// SQLite-only product controller
import { db } from '../db/index.js';

// Helper to format product response
const formatProduct = (row) => {
  if (!row) return null;
  return {
    _id: row.id.toString(),
    id: row.id.toString(),
    name: row.name,
    description: row.description || '',
    price: row.price,
    cost: row.cost || 0,
    category: row.category,
    stock: row.stock || 0,
    minStock: row.minStock || 10,
    isAvailable: row.isAvailable === 1,
    active: row.active === 1,
    image: row.image || '',
    sku: row.sku || '',
    barcode: row.barcode || '',
    branch: row.branch,
    createdAt: row.updated_at,
    updatedAt: row.updated_at
  };
};

// Get all products - SQLite only
export const getProducts = async (req, res) => {
  try {
    const { category, lowStock, search, page = 1, limit = 20 } = req.query;
    const branchId = req.user.branch._id || req.user.branch.id;

    let query = 'SELECT * FROM products WHERE branch = ?';
    const params = [branchId.toString()];

    if (category && category !== 'all') {
      query += ' AND category = ?';
      params.push(category);
    }

    if (lowStock === 'true') {
      query += ' AND stock <= 10';
    }

    if (search) {
      query += ' AND (name LIKE ? OR description LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
    }

    query += ' ORDER BY name ASC';

    // Get total count
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
    const totalResult = db.prepare(countQuery).get(...params);
    const total = totalResult.total || 0;

    // Apply pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);

    const rows = db.prepare(query).all(...params);
    const products = rows.map(formatProduct);

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

// Get single product - SQLite only
export const getProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const branchId = req.user.branch._id || req.user.branch.id;

    const product = db.prepare('SELECT * FROM products WHERE id = ? AND branch = ?').get(productId, branchId.toString());

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      data: formatProduct(product)
    });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch product'
    });
  }
};

// Create product - SQLite only
export const createProduct = async (req, res) => {
  try {
    const { name, description, price, cost, category, stock, minStock, isAvailable, image } = req.body;
    const branchId = req.user.branch._id || req.user.branch.id;

    if (!name || !price || !category) {
      return res.status(400).json({
        success: false,
        message: 'Name, price, and category are required'
      });
    }

    const cleanCategory = category.toString().trim();
    if (!cleanCategory) {
      return res.status(400).json({
        success: false,
        message: 'Category cannot be empty'
      });
    }

    const result = db.prepare(`
      INSERT INTO products (name, description, price, cost, category, stock, minStock, isAvailable, active, image, branch)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name.toString().trim(),
      description ? description.toString().trim() : '',
      parseFloat(price),
      cost ? parseFloat(cost) : 0,
      cleanCategory,
      stock ? parseInt(stock) : 0,
      minStock ? parseInt(minStock) : 10,
      isAvailable !== false ? 1 : 0,
      1,
      image || '',
      branchId.toString()
    );

    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid);

    // Emit real-time event
    if (req.io) {
      const formattedProduct = formatProduct(product);
      req.io.to(`branch-${branchId}`).emit('product-created', formattedProduct);
      req.io.to(`pos-${branchId}`).emit('product-added', formattedProduct);
    }

    res.status(201).json({
      success: true,
      data: formatProduct(product),
      message: 'Product created successfully'
    });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create product'
    });
  }
};

// Update product - SQLite only
export const updateProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const branchId = req.user.branch._id || req.user.branch.id;
    const { name, description, price, cost, category, stock, minStock, isAvailable, image } = req.body;

    // Check if product exists
    const existing = db.prepare('SELECT * FROM products WHERE id = ? AND branch = ?').get(productId, branchId.toString());
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Build update query dynamically
    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name.toString().trim());
    }
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description.toString().trim());
    }
    if (price !== undefined) {
      updates.push('price = ?');
      params.push(parseFloat(price));
    }
    if (cost !== undefined) {
      updates.push('cost = ?');
      params.push(parseFloat(cost));
    }
    if (category !== undefined) {
      updates.push('category = ?');
      params.push(category.toString().trim());
    }
    if (stock !== undefined) {
      updates.push('stock = ?');
      params.push(parseInt(stock));
    }
    if (minStock !== undefined) {
      updates.push('minStock = ?');
      params.push(parseInt(minStock));
    }
    if (isAvailable !== undefined) {
      updates.push('isAvailable = ?');
      params.push(isAvailable ? 1 : 0);
    }
    if (image !== undefined) {
      updates.push('image = ?');
      params.push(image);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(productId, branchId.toString());

    const query = `UPDATE products SET ${updates.join(', ')} WHERE id = ? AND branch = ?`;
    db.prepare(query).run(...params);

    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);

    // Emit real-time event
    if (req.io) {
      const formattedProduct = formatProduct(product);
      req.io.to(`branch-${branchId}`).emit('product-updated', formattedProduct);
      req.io.to(`pos-${branchId}`).emit('product-modified', formattedProduct);
    }

    res.json({
      success: true,
      data: formatProduct(product),
      message: 'Product updated successfully'
    });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update product'
    });
  }
};

// Delete product - SQLite only
export const deleteProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const branchId = req.user.branch._id || req.user.branch.id;

    const product = db.prepare('SELECT * FROM products WHERE id = ? AND branch = ?').get(productId, branchId.toString());

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    db.prepare('DELETE FROM products WHERE id = ? AND branch = ?').run(productId, branchId.toString());

    // Emit real-time event
    if (req.io) {
      const formattedProduct = formatProduct(product);
      req.io.to(`branch-${branchId}`).emit('product-deleted', formattedProduct);
      req.io.to(`pos-${branchId}`).emit('product-removed', formattedProduct);
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

// Update stock - SQLite only
export const updateStock = async (req, res) => {
  try {
    const productId = req.params.id;
    const branchId = req.user.branch._id || req.user.branch.id;
    const { stock } = req.body;

    const product = db.prepare('SELECT * FROM products WHERE id = ? AND branch = ?').get(productId, branchId.toString());

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    db.prepare('UPDATE products SET stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND branch = ?')
      .run(parseInt(stock), productId, branchId.toString());

    const updatedProduct = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);

    // Emit real-time event
    if (req.io) {
      req.io.to(`branch-${branchId}`).emit('stock-updated', {
        productId: updatedProduct.id.toString(),
        stock: updatedProduct.stock,
        branch: branchId.toString()
      });
    }

    res.json({
      success: true,
      data: formatProduct(updatedProduct),
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

// Get categories - SQLite only
export const getCategories = async (req, res) => {
  try {
    const branchId = req.user.branch._id || req.user.branch.id;

    const rows = db.prepare('SELECT DISTINCT category FROM products WHERE branch = ? AND category IS NOT NULL AND category != ""')
      .all(branchId.toString());

    const categories = [...new Set(rows.map(r => r.category).filter(cat => cat && cat.trim()))].sort();

    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories'
    });
  }
};

// Get low stock products - SQLite only
export const getLowStockProducts = async (req, res) => {
  try {
    const branchId = req.user.branch._id || req.user.branch.id;

    const rows = db.prepare('SELECT * FROM products WHERE branch = ? AND stock <= 10 ORDER BY stock ASC')
      .all(branchId.toString());

    const products = rows.map(formatProduct);

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
