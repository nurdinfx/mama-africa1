// SQLite-only order controller
import { db } from '../db/index.js';

// Generate order number
const generateOrderNumber = (branchCode) => {
  const today = new Date();
  const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

  // Get last order number for today
  const lastOrder = db.prepare(`
    SELECT orderNumber FROM orders 
    WHERE orderNumber LIKE ? 
    ORDER BY id DESC LIMIT 1
  `).get(`${branchCode}-${dateStr}-%`);

  let sequence = 1;
  if (lastOrder) {
    const parts = lastOrder.orderNumber.split('-');
    sequence = parseInt(parts[parts.length - 1]) + 1;
  }

  return `${branchCode}-${dateStr}-${String(sequence).padStart(4, '0')}`;
};

// Helper to format order response
const formatOrder = (orderRow, includeItems = true) => {
  if (!orderRow) return null;

  const order = {
    _id: orderRow.id.toString(),
    id: orderRow.id.toString(),
    orderNumber: orderRow.orderNumber,
    orderType: orderRow.orderType,
    status: orderRow.status,
    customer: orderRow.customer,
    table: orderRow.tableId,
    tableNumber: orderRow.tableNumber,
    customerName: orderRow.customerName || 'Walking Customer',
    customerPhone: orderRow.customerPhone,
    subtotal: orderRow.subtotal || 0,
    tax: orderRow.tax || 0,
    discount: orderRow.discount || 0,
    serviceCharge: orderRow.serviceCharge || 0,
    finalTotal: orderRow.finalTotal || 0,
    paymentMethod: orderRow.paymentMethod || 'cash',
    paymentStatus: orderRow.paymentStatus || 'pending',
    cashier: orderRow.cashier,
    branch: orderRow.branch,
    kitchenStatus: orderRow.kitchenStatus || 'pending',
    kitchenNotes: orderRow.kitchenNotes,
    createdAt: orderRow.createdAt || orderRow.updated_at,
    updatedAt: orderRow.updated_at
  };

  if (includeItems) {
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderRow.id);
    order.items = items.map(item => ({
      _id: item.id.toString(),
      product: item.product_id,
      productName: item.product_name,
      quantity: item.quantity,
      price: item.price,
      total: item.total,
      notes: item.notes
    }));
  }

  return order;
};

// Create new order - SQLite only
export const createOrder = async (req, res) => {
  const transaction = db.transaction(() => {
    try {
      const { items, orderType, notes, paymentMethod, tax: providedTax, finalTotal: providedTotal } = req.body;

      // Handle parameter aliases from POS
      const customerId = req.body.customerId || req.body.customer; // POS sends 'customer'
      const customerName = req.body.customerName;
      const customerPhone = req.body.customerPhone;

      // Handle table lookup
      let tableId = req.body.tableId;
      const tableNumberParam = req.body.tableNumber;

      const branchId = req.user.branch._id || req.user.branch.id;
      const branchCode = req.user.branch.branchCode || 'MAIN';

      // Look up table by number if ID is missing but number is provided
      if (!tableId && tableNumberParam) {
        const tableObj = db.prepare('SELECT id FROM tables WHERE (number = ? OR tableNumber = ?) AND branch = ?').get(tableNumberParam, tableNumberParam, branchId.toString());
        if (tableObj) {
          tableId = tableObj.id;
        }
      }

      if (!items || !Array.isArray(items) || items.length === 0) {
        throw new Error('Order must contain at least one item');
      }

      // Generate order number
      const orderNumber = generateOrderNumber(branchCode);

      // Process items and calculate totals
      let subtotal = 0;
      const orderItems = [];

      for (const item of items) {
        const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product);
        if (!product) {
          throw new Error(`Product not found: ${item.product}`);
        }

        if (!product.isAvailable) {
          throw new Error(`Product ${product.name} is not available`);
        }

        if (product.stock < item.quantity) {
          throw new Error(`Insufficient stock for ${product.name}. Available: ${product.stock}, Requested: ${item.quantity}`);
        }

        // Update product stock
        db.prepare('UPDATE products SET stock = stock - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(item.quantity, item.product);

        const itemTotal = product.price * item.quantity;
        subtotal += itemTotal;

        orderItems.push({
          product_id: product.id.toString(),
          product_name: product.name,
          quantity: item.quantity,
          price: product.price,
          total: itemTotal,
          notes: item.notes || ''
        });
      }

      // Get branch settings
      const branch = db.prepare('SELECT * FROM branches WHERE id = ?').get(branchId);
      let branchSettings = {};
      if (branch && branch.settings) {
        try {
          branchSettings = JSON.parse(branch.settings);
        } catch (e) {
          branchSettings = { taxRate: 4, serviceCharge: 5 };
        }
      }

      // Calculate totals
      const taxRate = branchSettings.taxRate || 4;
      const serviceChargeRate = branchSettings.serviceCharge || 5;

      const tax = providedTax !== undefined ? providedTax : (subtotal * (taxRate / 100));
      const serviceCharge = subtotal * (serviceChargeRate / 100);
      const finalTotal = providedTotal !== undefined ? providedTotal : (subtotal + tax + serviceCharge);

      // Handle customer
      let customer = null;
      if (customerId) {
        customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
      } else if (customerPhone) {
        customer = db.prepare('SELECT * FROM customers WHERE phone = ? AND branch = ?').get(customerPhone, branchId.toString());
        if (!customer && customerName) {
          const custResult = db.prepare(`
            INSERT INTO customers (name, phone, branch)
            VALUES (?, ?, ?)
          `).run(customerName, customerPhone, branchId.toString());
          customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(custResult.lastInsertRowid);
        }
      }

      // Handle table assignment
      let table = null;
      let tableNumber = '';
      if (tableId && orderType === 'dine-in') {
        table = db.prepare('SELECT * FROM tables WHERE id = ?').get(tableId);
        if (!table) {
          throw new Error('Table not found');
        }

        if (table.status !== 'available') {
          throw new Error(`Table ${table.number} is not available`);
        }

        // Update table status
        db.prepare('UPDATE tables SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run('occupied', tableId);
        tableNumber = table.number;
      }

      // Create order
      const orderResult = db.prepare(`
        INSERT INTO orders (
          orderNumber, orderType, status, customer, tableId, tableNumber,
          customerName, customerPhone, subtotal, tax, serviceCharge, finalTotal,
          paymentMethod, paymentStatus, cashier, branch, kitchenStatus, kitchenNotes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        orderNumber,
        orderType,
        'pending',
        customer ? customer.id.toString() : null,
        tableId || null,
        tableNumber,
        customer?.name || customerName || 'Walking Customer',
        customer?.phone || customerPhone,
        subtotal,
        tax,
        serviceCharge,
        finalTotal,
        paymentMethod || 'cash',
        'pending',
        req.user.id.toString(),
        branchId.toString(),
        'pending',
        notes || ''
      );

      const orderId = orderResult.lastInsertRowid;

      // Insert order items
      const insertItem = db.prepare(`
        INSERT INTO order_items (order_id, product_id, product_name, quantity, price, total, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const item of orderItems) {
        insertItem.run(orderId, item.product_id, item.product_name, item.quantity, item.price, item.total, item.notes);
      }

      // Get full order
      const orderRow = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
      const formattedOrder = formatOrder(orderRow, true);

      // Emit real-time events
      if (req.io) {
        req.io.to(`branch-${branchId}`).emit('new-order', formattedOrder);
        req.io.to(`kitchen-${branchId}`).emit('new-kitchen-order', formattedOrder);
        req.io.to(`pos-${branchId}`).emit('order-created', formattedOrder);
      }

      return formattedOrder;
    } catch (error) {
      throw error;
    }
  });

  try {
    const order = transaction();
    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: order
    });
  } catch (error) {
    console.error('Order creation error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to create order'
    });
  }
};

// Get all orders - SQLite only
export const getOrders = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      orderType,
      paymentStatus,
      kitchenStatus,
      startDate,
      endDate,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const branchId = req.user.branch._id || req.user.branch.id;

    let query = 'SELECT * FROM orders WHERE branch = ?';
    const params = [branchId.toString()];

    if (status) {
      if (status === 'active') {
        query += " AND status IN ('pending', 'confirmed', 'preparing', 'ready')";
      } else {
        query += ' AND status = ?';
        params.push(status);
      }
    }

    if (kitchenStatus) {
      query += ' AND kitchenStatus = ?';
      params.push(kitchenStatus);
    }

    if (orderType) {
      query += ' AND orderType = ?';
      params.push(orderType);
    }

    if (paymentStatus) {
      query += ' AND paymentStatus = ?';
      params.push(paymentStatus);
    }

    if (startDate) {
      query += ' AND createdAt >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND createdAt <= ?';
      params.push(endDate);
    }

    if (search) {
      query += ' AND (orderNumber LIKE ? OR customerName LIKE ? OR customerPhone LIKE ? OR tableNumber LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Get total count
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
    const totalResult = db.prepare(countQuery).get(...params);
    const total = totalResult.total || 0;

    // Apply sorting
    const sortField = sortBy === 'createdAt' ? 'createdAt' : 'updated_at';
    query += ` ORDER BY ${sortField} ${sortOrder.toUpperCase()}`;

    // Apply pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);

    const rows = db.prepare(query).all(...params);
    const orders = rows.map(row => formatOrder(row, true));

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders'
    });
  }
};

// Get kitchen orders - SQLite only
export const getKitchenOrders = async (req, res) => {
  try {
    const {
      kitchenStatus = 'all',
      limit = 50,
      startDate,
      endDate
    } = req.query;

    const branchId = req.user.branch._id || req.user.branch.id;

    let query = `
      SELECT * FROM orders 
      WHERE branch = ? 
      AND status IN ('pending', 'confirmed', 'preparing', 'ready')
    `;
    const params = [branchId.toString()];

    if (kitchenStatus && kitchenStatus !== 'all') {
      query += ' AND kitchenStatus = ?';
      params.push(kitchenStatus);
    }

    if (startDate) {
      query += ' AND createdAt >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND createdAt <= ?';
      params.push(endDate);
    }

    query += ' ORDER BY createdAt ASC LIMIT ?';
    params.push(parseInt(limit));

    const rows = db.prepare(query).all(...params);
    const orders = rows.map(row => formatOrder(row, true));

    // Get kitchen statistics
    const statsRows = db.prepare(`
      SELECT kitchenStatus, COUNT(*) as count 
      FROM orders 
      WHERE branch = ? AND status IN ('pending', 'confirmed', 'preparing', 'ready')
      GROUP BY kitchenStatus
    `).all(branchId.toString());

    const statusStats = {
      pending: 0,
      preparing: 0,
      ready: 0
    };

    statsRows.forEach(stat => {
      statusStats[stat.kitchenStatus] = stat.count;
    });

    res.json({
      success: true,
      data: {
        orders,
        stats: statusStats
      }
    });
  } catch (error) {
    console.error('Get kitchen orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch kitchen orders'
    });
  }
};

// Update order status - SQLite only
export const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, preparationTime, kitchenStatus } = req.body;
    const branchId = req.user.branch._id || req.user.branch.id;

    const orderRow = db.prepare('SELECT * FROM orders WHERE id = ? AND branch = ?').get(id, branchId.toString());
    if (!orderRow) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    const updates = [];
    const params = [];

    if (status) {
      const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'served', 'completed', 'cancelled'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status'
        });
      }
      updates.push('status = ?');
      params.push(status);

      // Handle stock restoration on cancel
      if (status === 'cancelled') {
        const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id);
        for (const item of items) {
          db.prepare('UPDATE products SET stock = stock + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(item.quantity, item.product_id);
        }

        // Free table
        if (orderRow.tableId) {
          db.prepare('UPDATE tables SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run('available', orderRow.tableId);
        }
      }

      if (status === 'completed') {
        updates.push('paymentStatus = ?');
        params.push('paid');
      }
    }

    if (kitchenStatus) {
      const validKitchenStatuses = ['pending', 'preparing', 'ready', 'served'];
      if (!validKitchenStatuses.includes(kitchenStatus)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid kitchen status'
        });
      }
      updates.push('kitchenStatus = ?');
      params.push(kitchenStatus);

      if (kitchenStatus === 'ready') {
        updates.push('status = ?');
        params.push('ready');
      }
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id, branchId.toString());

    const query = `UPDATE orders SET ${updates.join(', ')} WHERE id = ? AND branch = ?`;
    db.prepare(query).run(...params);

    const updatedOrderRow = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    const formattedOrder = formatOrder(updatedOrderRow, true);

    // Emit real-time events
    if (req.io) {
      req.io.to(`branch-${branchId}`).emit('order-status-updated', formattedOrder);
      req.io.to(`kitchen-${branchId}`).emit('kitchen-order-updated', formattedOrder);
      req.io.to(`pos-${branchId}`).emit('order-updated', formattedOrder);

      if (formattedOrder.kitchenStatus === 'ready') {
        req.io.to(`branch-${branchId}`).emit('order-ready', formattedOrder);
      }
    }

    res.json({
      success: true,
      message: 'Order updated successfully',
      data: formattedOrder
    });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update order status'
    });
  }
};

// Process payment - SQLite only
export const processPayment = async (req, res) => {
  const transaction = db.transaction(() => {
    try {
      const { id } = req.params;
      const { paymentMethod, amount, notes } = req.body;
      const branchId = req.user.branch._id || req.user.branch.id;

      const orderRow = db.prepare('SELECT * FROM orders WHERE id = ? AND branch = ?').get(id, branchId.toString());
      if (!orderRow) {
        throw new Error('Order not found');
      }

      if (orderRow.paymentStatus === 'paid') {
        throw new Error('Order is already paid');
      }

      if (amount < orderRow.finalTotal) {
        throw new Error(`Payment amount (${amount}) is less than order total (${orderRow.finalTotal})`);
      }

      // Update order
      db.prepare(`
        UPDATE orders 
        SET paymentMethod = ?, paymentStatus = ?, status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND branch = ?
      `).run(paymentMethod || 'cash', 'paid', 'completed', id, branchId.toString());

      // Free table
      if (orderRow.tableId) {
        db.prepare('UPDATE tables SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run('available', orderRow.tableId);
      }

      // Update customer loyalty (if customer exists)
      if (orderRow.customer) {
        const pointsEarned = Math.floor(orderRow.finalTotal);
        // Note: customer_ledger table can be updated here if needed
      }

      const updatedOrderRow = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
      const formattedOrder = formatOrder(updatedOrderRow, true);

      // Emit events
      if (req.io) {
        req.io.to(`branch-${branchId}`).emit('order-completed', formattedOrder);
        req.io.to(`kitchen-${branchId}`).emit('order-completed', formattedOrder);
      }

      return {
        order: formattedOrder,
        change: amount - orderRow.finalTotal
      };
    } catch (error) {
      throw error;
    }
  });

  try {
    const result = transaction();
    res.json({
      success: true,
      message: 'Payment processed successfully',
      data: result
    });
  } catch (error) {
    console.error('Process payment error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to process payment'
    });
  }
};

// Update order - SQLite only (simplified version)
export const updateOrder = async (req, res) => {
  const transaction = db.transaction(() => {
    try {
      const { id } = req.params;
      const { items, notes, tax: providedTax, finalTotal: providedTotal } = req.body;
      const branchId = req.user.branch._id || req.user.branch.id;

      const orderRow = db.prepare('SELECT * FROM orders WHERE id = ? AND branch = ?').get(id, branchId.toString());
      if (!orderRow) {
        throw new Error('Order not found');
      }

      if (orderRow.status === 'completed' || orderRow.status === 'cancelled' || orderRow.paymentStatus === 'paid') {
        throw new Error('Cannot update completed or paid orders');
      }

      // Revert previous stock
      const oldItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id);
      for (const item of oldItems) {
        db.prepare('UPDATE products SET stock = stock + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(item.quantity, item.product_id);
      }

      // Validate and reserve new stock
      let subtotal = 0;
      const orderItems = [];

      for (const item of items) {
        const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product);
        if (!product) {
          throw new Error(`Product not found: ${item.product}`);
        }

        if (!product.isAvailable) {
          throw new Error(`Product ${product.name} is not available`);
        }

        if (product.stock < item.quantity) {
          throw new Error(`Insufficient stock for ${product.name}. Available: ${product.stock}, Requested: ${item.quantity}`);
        }

        // Update product stock
        db.prepare('UPDATE products SET stock = stock - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(item.quantity, item.product);

        const itemTotal = product.price * item.quantity;
        subtotal += itemTotal;

        orderItems.push({
          product_id: product.id.toString(),
          product_name: product.name,
          quantity: item.quantity,
          price: product.price,
          total: itemTotal,
          notes: item.notes || ''
        });
      }

      // Get branch settings
      const branch = db.prepare('SELECT * FROM branches WHERE id = ?').get(branchId);
      let branchSettings = {};
      if (branch && branch.settings) {
        try {
          branchSettings = JSON.parse(branch.settings);
        } catch (e) {
          branchSettings = { taxRate: 4, serviceCharge: 5 };
        }
      }

      const taxRate = branchSettings.taxRate || 4;
      const serviceChargeRate = branchSettings.serviceCharge || 5;

      const tax = providedTax !== undefined ? providedTax : (subtotal * (taxRate / 100));
      const serviceCharge = subtotal * (serviceChargeRate / 100);
      const finalTotal = providedTotal !== undefined ? providedTotal : (subtotal + tax + serviceCharge);

      // Update order
      db.prepare(`
        UPDATE orders 
        SET subtotal = ?, tax = ?, serviceCharge = ?, finalTotal = ?, kitchenNotes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND branch = ?
      `).run(subtotal, tax, serviceCharge, finalTotal, notes || '', id, branchId.toString());

      // Delete old items and insert new ones
      db.prepare('DELETE FROM order_items WHERE order_id = ?').run(id);

      const insertItem = db.prepare(`
        INSERT INTO order_items (order_id, product_id, product_name, quantity, price, total, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const item of orderItems) {
        insertItem.run(id, item.product_id, item.product_name, item.quantity, item.price, item.total, item.notes);
      }

      const updatedOrderRow = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
      const formattedOrder = formatOrder(updatedOrderRow, true);

      // Emit events
      if (req.io) {
        req.io.to(`branch-${branchId}`).emit('pos-order-updated', formattedOrder);
        req.io.to(`kitchen-${branchId}`).emit('kitchen-order-updated', formattedOrder);
      }

      return formattedOrder;
    } catch (error) {
      throw error;
    }
  });

  try {
    const order = transaction();
    res.json({
      success: true,
      message: 'Order updated successfully',
      data: order
    });
  } catch (error) {
    console.error('Update order error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to update order'
    });
  }
};

// Get order statistics - SQLite only
export const getOrderStats = async (req, res) => {
  try {
    const { period = 'today' } = req.query;
    const branchId = req.user.branch._id || req.user.branch.id;

    let startDate, endDate;
    const now = new Date();

    switch (period) {
      case 'today':
        startDate = new Date(now.setHours(0, 0, 0, 0)).toISOString();
        endDate = new Date(now.setHours(23, 59, 59, 999)).toISOString();
        break;
      case 'week':
        startDate = new Date(now.setDate(now.getDate() - 7)).toISOString();
        endDate = new Date().toISOString();
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        endDate = new Date().toISOString();
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1).toISOString();
        endDate = new Date().toISOString();
        break;
      default:
        startDate = new Date(now.setHours(0, 0, 0, 0)).toISOString();
        endDate = new Date(now.setHours(23, 59, 59, 999)).toISOString();
    }

    const rows = db.prepare(`
      SELECT 
        COUNT(*) as totalOrders,
        SUM(finalTotal) as totalRevenue,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completedOrders,
        SUM(CASE WHEN status IN ('pending', 'confirmed', 'preparing') THEN 1 ELSE 0 END) as pendingOrders,
        AVG(finalTotal) as averageOrderValue
      FROM orders
      WHERE branch = ? AND createdAt >= ? AND createdAt <= ?
    `).get(branchId.toString(), startDate, endDate);

    res.json({
      success: true,
      data: {
        period,
        overview: {
          totalOrders: rows.totalOrders || 0,
          totalRevenue: rows.totalRevenue || 0,
          completedOrders: rows.completedOrders || 0,
          pendingOrders: rows.pendingOrders || 0,
          averageOrderValue: rows.averageOrderValue || 0
        }
      }
    });
  } catch (error) {

    console.error('Get order stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order statistics'
    });
  }
};

// Hard delete order - SQLite only (Admin/Manager only)
export const deleteOrder = async (req, res) => {
  const transaction = db.transaction(() => {
    try {
      const { id } = req.params;
      const branchId = req.user.branch._id || req.user.branch.id;

      const orderRow = db.prepare('SELECT * FROM orders WHERE id = ? AND branch = ?').get(id, branchId.toString());
      if (!orderRow) {
        throw new Error('Order not found');
      }

      // Restore stock if order wasn't already cancelled
      if (orderRow.status !== 'cancelled') {
        const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id);
        for (const item of items) {
          db.prepare('UPDATE products SET stock = stock + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(item.quantity, item.product_id);
        }
      }

      // Free table if occupied by this order
      if (orderRow.tableId && orderRow.status !== 'completed' && orderRow.status !== 'cancelled') {
        db.prepare('UPDATE tables SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run('available', orderRow.tableId);
      }

      // Delete items and order
      db.prepare('DELETE FROM order_items WHERE order_id = ?').run(id);
      db.prepare('DELETE FROM orders WHERE id = ?').run(id);

      return orderRow;
    } catch (error) {
      throw error;
    }
  });

  try {
    const deletedOrder = transaction();

    // Emit real-time event
    if (req.io) {
      const branchId = req.user.branch._id || req.user.branch.id;
      req.io.to(`branch-${branchId}`).emit('order-deleted', { id: req.params.id });
    }

    res.json({
      success: true,
      message: 'Order permanently deleted'
    });
  } catch (error) {
    console.error('Delete order error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete order'
    });
  }
};
