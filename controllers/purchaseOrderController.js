// SQLite-only purchase order controller
import { db } from '../db/index.js';

// Helper to format purchase order response
const formatPurchaseOrder = (row, items = []) => {
  if (!row) return null;
  return {
    _id: row.id.toString(),
    id: row.id.toString(),
    orderNumber: row.orderNumber,
    supplierId: row.supplierId,
    status: row.status,
    subtotal: row.subtotal,
    taxTotal: row.taxTotal,
    discountTotal: row.discountTotal,
    grandTotal: row.grandTotal,
    branch: row.branch,
    createdBy: row.createdBy,
    approvedBy: row.approvedBy,
    expectedDelivery: row.expectedDelivery,
    approvedAt: row.approvedAt,
    notes: row.notes,
    items,
    createdAt: row.updated_at,
    updatedAt: row.updated_at
  };
};

export const createPurchaseOrder = async (req, res) => {
  const transaction = db.transaction((data) => {
    const { supplierId, items, expectedDelivery, notes, branchId, userId } = data;

    // 1. Create Purchase Order record
    const poResult = db.prepare(`
        INSERT INTO purchase_orders (supplierId, orderNumber, expectedDelivery, status, subtotal, taxTotal, discountTotal, grandTotal, branch, createdBy, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
      supplierId,
      `PO-${Date.now()}`,
      expectedDelivery,
      'pending',
      data.subtotal,
      data.taxTotal,
      data.discountTotal,
      data.grandTotal,
      branchId.toString(),
      userId.toString(),
      notes || ''
    );

    const poId = poResult.lastInsertRowid;

    // 2. Create Items
    for (const item of items) {
      db.prepare(`
          INSERT INTO purchase_order_items (purchase_order_id, productId, orderedQty, receivedQty, unitCost, discount, tax, total)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
        poId,
        item.productId,
        item.orderedQty,
        0,
        item.unitCost,
        item.discount || 0,
        item.tax || 0,
        item.total
      );
    }

    return poId;
  });

  try {
    const { supplierId, items, expectedDelivery, notes } = req.body;
    const userId = req.user._id || req.user.id;
    const branchId = req.user.branch._id || req.user.branch.id;

    if (!supplierId || !Array.isArray(items) || items.length === 0 || !expectedDelivery) {
      return res.status(400).json({ success: false, message: 'supplierId, items and expectedDelivery are required' });
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

      const base = item.orderedQty * item.unitCost;
      const discount = base * ((item.discount || 0) / 100);
      const tax = (base - discount) * ((item.tax || 0) / 100);
      const total = base - discount + tax;

      subtotal += base;
      discountTotal += discount;
      taxTotal += tax;

      validatedItems.push({
        ...item,
        total: Math.round(total * 100) / 100
      });
    }

    const grandTotal = subtotal - discountTotal + taxTotal;

    const poId = transaction({
      supplierId,
      items: validatedItems,
      expectedDelivery,
      notes,
      branchId,
      userId,
      subtotal: Math.round(subtotal * 100) / 100,
      taxTotal: Math.round(taxTotal * 100) / 100,
      discountTotal: Math.round(discountTotal * 100) / 100,
      grandTotal: Math.round(grandTotal * 100) / 100
    });

    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(poId);
    const poItems = db.prepare('SELECT * FROM purchase_order_items WHERE purchase_order_id = ?').all(poId);

    res.status(201).json({
      success: true,
      data: formatPurchaseOrder(po, poItems),
      message: 'Purchase order created'
    });
  } catch (error) {
    console.error('Create purchase order error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to create purchase order' });
  }
};

export const getPurchaseOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, supplierId, from, to } = req.query;
    const branchId = req.user.branch._id || req.user.branch.id;

    let query = 'SELECT * FROM purchase_orders WHERE branch = ?';
    const params = [branchId.toString()];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    if (supplierId) {
      query += ' AND supplierId = ?';
      params.push(supplierId);
    }
    if (from) {
      query += ' AND updated_at >= ?';
      params.push(from);
    }
    if (to) {
      query += ' AND updated_at <= ?';
      params.push(to);
    }

    query += ' ORDER BY id DESC';

    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as count');
    const totalResult = db.prepare(countQuery).get(...params);
    const total = totalResult ? totalResult.count : 0;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ' LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const rows = db.prepare(query).all(...params);
    const enrichedPOs = rows.map(row => {
      const items = db.prepare('SELECT * FROM purchase_order_items WHERE purchase_order_id = ?').all(row.id);
      return formatPurchaseOrder(row, items);
    });

    res.json({
      success: true,
      data: {
        purchaseOrders: enrichedPOs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Get purchase orders error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to fetch purchase orders' });
  }
};

export const approvePurchaseOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const branchId = req.user.branch._id || req.user.branch.id;
    const userId = req.user._id || req.user.id;

    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ? AND branch = ?').get(id, branchId.toString());
    if (!po) {
      return res.status(404).json({ success: false, message: 'Purchase order not found' });
    }

    db.prepare('UPDATE purchase_orders SET status = ?, approvedBy = ?, approvedAt = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run('approved', userId.toString(), id);

    const updatedPO = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id);
    const poItems = db.prepare('SELECT * FROM purchase_order_items WHERE purchase_order_id = ?').all(id);

    res.json({ success: true, data: formatPurchaseOrder(updatedPO, poItems), message: 'Purchase order approved' });
  } catch (error) {
    console.error('Approve purchase order error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to approve purchase order' });
  }
};
