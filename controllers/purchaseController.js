// SQLite-only purchase controller
import { db } from '../db/index.js';

// Helper to format purchase response
const formatPurchase = (row, items = []) => {
  if (!row) return null;
  return {
    _id: row.id.toString(),
    id: row.id.toString(),
    purchaseNumber: row.purchaseNumber,
    supplierId: row.supplierId,
    subtotal: row.subtotal,
    taxTotal: row.taxTotal,
    discountTotal: row.discountTotal,
    grandTotal: row.grandTotal,
    paymentMethod: row.paymentMethod,
    status: row.status,
    branch: row.branch,
    createdBy: row.createdBy,
    notes: row.notes,
    items,
    createdAt: row.updated_at,
    updatedAt: row.updated_at
  };
};

export const createPurchase = async (req, res) => {
  const transaction = db.transaction((data) => {
    const { supplierId, items, paymentMethod, notes, branchId, userId } = data;

    // 1. Create Purchase record
    const purchaseResult = db.prepare(`
        INSERT INTO purchases (supplierId, subtotal, taxTotal, discountTotal, grandTotal, paymentMethod, branch, createdBy, notes, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
      supplierId,
      data.subtotal,
      data.taxTotal,
      data.discountTotal,
      data.grandTotal,
      paymentMethod || 'cash',
      branchId.toString(),
      userId.toString(),
      notes || '',
      'submitted'
    );

    const purchaseId = purchaseResult.lastInsertRowid;

    // 2. Create Items and Update Stock
    for (const item of items) {
      db.prepare(`
          INSERT INTO purchase_items (purchase_id, productId, qty, unitCost, discount, tax, total)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
        purchaseId,
        item.productId,
        item.qty,
        item.unitCost,
        item.discount || 0,
        item.tax || 0,
        item.total
      );

      // Update product stock and cost
      db.prepare('UPDATE products SET stock = stock + ?, cost = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND branch = ?')
        .run(item.qty, item.unitCost, item.productId, branchId.toString());
    }

    return purchaseId;
  });

  try {
    const { supplierId, items, paymentMethod, notes } = req.body;
    const userId = req.user._id || req.user.id;
    const branchId = req.user.branch._id || req.user.branch.id;

    if (!supplierId || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Supplier and at least one item are required'
      });
    }

    let subtotal = 0;
    let taxTotal = 0;
    let discountTotal = 0;
    const validatedItems = [];

    for (const item of items) {
      const product = db.prepare('SELECT * FROM products WHERE id = ? AND branch = ?').get(item.productId, branchId.toString());
      if (!product) {
        throw new Error(`Product not found: ${item.productId}`);
      }

      const baseAmount = item.qty * item.unitCost;
      const discountAmount = baseAmount * ((item.discount || 0) / 100);
      const taxAmount = (baseAmount - discountAmount) * ((item.tax || 0) / 100);
      const total = baseAmount - discountAmount + taxAmount;

      subtotal += baseAmount;
      discountTotal += discountAmount;
      taxTotal += taxAmount;

      validatedItems.push({
        ...item,
        total: Math.round(total * 100) / 100
      });
    }

    const grandTotal = subtotal - discountTotal + taxTotal;

    const purchaseId = transaction({
      supplierId,
      items: validatedItems,
      subtotal: Math.round(subtotal * 100) / 100,
      taxTotal: Math.round(taxTotal * 100) / 100,
      discountTotal: Math.round(discountTotal * 100) / 100,
      grandTotal: Math.round(grandTotal * 100) / 100,
      paymentMethod,
      notes,
      branchId,
      userId
    });

    const purchase = db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchaseId);
    const purchaseItems = db.prepare('SELECT * FROM purchase_items WHERE purchase_id = ?').all(purchaseId);

    // Emit real-time events
    if (req.io) {
      const formatted = formatPurchase(purchase, purchaseItems);
      req.io.to(`branch-${branchId}`).emit('purchase-created', formatted);
      req.io.to(`inventory-${branchId}`).emit('inventory-updated');
    }

    res.status(201).json({
      success: true,
      data: formatPurchase(purchase, purchaseItems),
      message: 'Purchase created successfully'
    });
  } catch (error) {
    console.error('Create purchase error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create purchase'
    });
  }
};

export const getPurchases = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const branchId = req.user.branch._id || req.user.branch.id;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const purchases = db.prepare('SELECT * FROM purchases WHERE branch = ? ORDER BY id DESC LIMIT ? OFFSET ?')
      .all(branchId.toString(), parseInt(limit), offset);

    const total = db.prepare('SELECT COUNT(*) as count FROM purchases WHERE branch = ?')
      .get(branchId.toString()).count;

    const enrichedPurchases = purchases.map(p => {
      const items = db.prepare('SELECT * FROM purchase_items WHERE purchase_id = ?').all(p.id);
      return formatPurchase(p, items);
    });

    res.json({
      success: true,
      data: {
        purchases: enrichedPurchases,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Get purchases error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch purchases'
    });
  }
};

export const getDailyPurchases = async (req, res) => {
  try {
    const { date } = req.query;
    const branchId = req.user.branch._id || req.user.branch.id;

    const targetDate = date || new Date().toISOString().split('T')[0];

    const purchases = db.prepare(`
        SELECT * FROM purchases 
        WHERE branch = ? AND date(updated_at) = date(?)
        ORDER BY id DESC
      `).all(branchId.toString(), targetDate);

    const summary = db.prepare(`
        SELECT SUM(grandTotal) as totalAmount, COUNT(*) as totalPurchases, AVG(grandTotal) as averagePurchase
        FROM purchases
        WHERE branch = ? AND date(updated_at) = date(?)
      `).get(branchId.toString(), targetDate);

    const enrichedPurchases = purchases.map(p => {
      const items = db.prepare('SELECT * FROM purchase_items WHERE purchase_id = ?').all(p.id);
      return formatPurchase(p, items);
    });

    res.json({
      success: true,
      data: {
        purchases: enrichedPurchases,
        summary: {
          totalAmount: summary.totalAmount || 0,
          totalPurchases: summary.totalPurchases || 0,
          averagePurchase: summary.averagePurchase || 0
        }
      }
    });
  } catch (error) {
    console.error('Get daily purchases error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch daily purchases'
    });
  }
};