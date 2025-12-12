
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Table from '../models/Table.js';
import Customer from '../models/Customer.js';
import mongoose from 'mongoose';

// Create new order
export const createOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { items, orderType, tableId, customerId, customerName, customerPhone, notes, paymentMethod } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Order must contain at least one item'
      });
    }

    // Generate order number
    const orderNumber = await Order.generateOrderNumber(req.user.branch.branchCode);

    // Process items and calculate totals
    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await Product.findById(item.product).session(session);
      if (!product) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          success: false,
          message: `Product not found: ${item.product}`
        });
      }

      if (!product.isAvailable) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: `Product ${product.name} is not available`
        });
      }

      if (product.stock < item.quantity) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${product.name}. Available: ${product.stock}, Requested: ${item.quantity}`
        });
      }

      // Update product stock
      product.stock -= item.quantity;
      product.salesCount += item.quantity;
      await product.save({ session });

      const itemTotal = product.price * item.quantity;
      subtotal += itemTotal;

      orderItems.push({
        product: product._id,
        quantity: item.quantity,
        price: product.price,
        notes: item.notes,
        total: itemTotal
      });
    }

    // Calculate totals
    const taxRate = req.user.branch.settings?.taxRate || 10;
    const serviceChargeRate = req.user.branch.settings?.serviceCharge || 5;

    const tax = subtotal * (taxRate / 100);
    const serviceCharge = subtotal * (serviceChargeRate / 100);
    const finalTotal = subtotal + tax + serviceCharge;

    // Handle customer
    let customer = null;
    if (customerId) {
      customer = await Customer.findById(customerId).session(session);
    } else if (customerPhone) {
      customer = await Customer.findOne({ phone: customerPhone, branch: req.user.branch._id }).session(session);
      if (!customer && customerName) {
        customer = new Customer({
          name: customerName,
          phone: customerPhone,
          branch: req.user.branch._id
        });
        await customer.save({ session });
      }
    }

    // Handle table assignment
    let table = null;
    let tableNumber = '';
    if (tableId && orderType === 'dine-in') {
      table = await Table.findById(tableId).session(session);
      if (!table) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          success: false,
          message: 'Table not found'
        });
      }

      if (table.status !== 'available') {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: `Table ${table.number} is not available`
        });
      }

      // Update table status
      table.status = 'occupied';
      table.currentSession = {
        startedAt: new Date(),
        customers: items.reduce((sum, item) => sum + item.quantity, 0) || 1,
        waiter: req.user._id
      };
      await table.save({ session });
      tableNumber = table.number;
    }

    // Create order
    const order = new Order({
      orderNumber,
      items: orderItems,
      orderType,
      table: table?._id,
      tableNumber,
      customer: customer?._id,
      customerName: customer?.name || customerName || 'Walking Customer',
      customerPhone: customer?.phone || customerPhone,
      subtotal,
      tax,
      serviceCharge,
      finalTotal,
      paymentMethod: paymentMethod || 'cash',
      cashier: req.user._id,
      branch: req.user.branch._id,
      kitchenNotes: notes,
      kitchenStatus: 'pending', // Add kitchen status field
      status: 'pending'
    });

    await order.save({ session });
    await order.populate([
      { path: 'items.product', select: 'name category' },
      { path: 'table', select: 'number name' },
      { path: 'customer', select: 'name phone' },
      { path: 'cashier', select: 'name' }
    ]);

    await session.commitTransaction();
    session.endSession();

    // Emit real-time events for both orders and kitchen
    if (req.io) {
      req.io.to(`branch-${req.user.branch._id}`).emit('new-order', order);
      req.io.to(`kitchen-${req.user.branch._id}`).emit('new-kitchen-order', order);
      req.io.to(`pos-${req.user.branch._id}`).emit('order-created', order);
    }

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: order
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error('Order creation error:', error);

    // Handle Mongoose Validation Errors
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Order validation failed: ' + Object.values(error.errors).map(e => e.message).join(', '),
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get all orders
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

    // Build filter - handle both ObjectId and string branch IDs
    const filter = { branch: req.user.branch._id };

    if (status) {
      if (status === 'active') {
        filter.status = { $in: ['pending', 'confirmed', 'preparing', 'ready'] };
      } else {
        filter.status = status;
      }
    }

    if (kitchenStatus) {
      filter.kitchenStatus = kitchenStatus;
    }

    if (orderType) filter.orderType = orderType;
    if (paymentStatus) filter.paymentStatus = paymentStatus;

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    if (search) {
      filter.$or = [
        { orderNumber: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
        { customerPhone: { $regex: search, $options: 'i' } },
        { tableNumber: { $regex: search, $options: 'i' } }
      ];
    }

    const sortConfig = {};
    sortConfig[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const orders = await Order.find(filter)
      .populate([
        { path: 'items.product', select: 'name category price' },
        { path: 'table', select: 'number name' },
        { path: 'customer', select: 'name phone' },
        { path: 'cashier', select: 'name' }
      ])
      .sort(sortConfig)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const total = await Order.countDocuments(filter);

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

    // Handle CastError specifically
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid data format in request'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders'
    });
  }
};

// Get kitchen orders (specialized for kitchen view)
export const getKitchenOrders = async (req, res) => {
  try {
    const {
      kitchenStatus = 'all',
      limit = 50,
      startDate,
      endDate
    } = req.query;

    // Build filter for kitchen orders
    const filter = {
      branch: req.user.branch._id,
      status: { $in: ['pending', 'confirmed', 'preparing', 'ready'] }
    };

    if (kitchenStatus && kitchenStatus !== 'all') {
      filter.kitchenStatus = kitchenStatus;
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const orders = await Order.find(filter)
      .populate([
        { path: 'items.product', select: 'name category' },
        { path: 'table', select: 'number name' },
        { path: 'cashier', select: 'name' }
      ])
      .sort({ createdAt: 1 }) // Oldest first for kitchen
      .limit(limit * 1)
      .lean();

    // Get kitchen statistics
    const stats = await Order.aggregate([
      {
        $match: {
          branch: req.user.branch._id,
          status: { $in: ['pending', 'confirmed', 'preparing', 'ready'] }
        }
      },
      {
        $group: {
          _id: '$kitchenStatus',
          count: { $sum: 1 }
        }
      }
    ]);

    const statusStats = {
      pending: 0,
      preparing: 0,
      ready: 0
    };

    stats.forEach(stat => {
      statusStats[stat._id] = stat.count;
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

// Update order status
export const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, preparationTime, kitchenStatus } = req.body;

    const order = await Order.findOne({ _id: id, branch: req.user.branch._id });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Update status
    if (status) {
      const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'served', 'completed', 'cancelled'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status'
        });
      }
      order.status = status;
    }

    // Update kitchen status
    if (kitchenStatus) {
      const validKitchenStatuses = ['pending', 'preparing', 'ready', 'served'];
      if (!validKitchenStatuses.includes(kitchenStatus)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid kitchen status'
        });
      }
      order.kitchenStatus = kitchenStatus;

      // If kitchen status is ready, update order status
      if (kitchenStatus === 'ready') {
        order.status = 'ready';
      }
    }

    const now = new Date();
    if (status === 'preparing' && preparationTime) {
      order.preparationTime = preparationTime;
    } else if (status === 'served') {
      order.servedAt = now;
    } else if (status === 'completed') {
      order.completedAt = now;
      order.paymentStatus = 'paid';
    } else if (status === 'cancelled') {
      // Restore product stock
      for (const item of order.items) {
        await Product.findByIdAndUpdate(item.product, {
          $inc: { stock: item.quantity }
        });
      }

      // Free table
      if (order.table) {
        await Table.findByIdAndUpdate(order.table, {
          status: 'available',
          currentSession: null
        });
      }
    }

    await order.save();
    await order.populate([
      { path: 'items.product', select: 'name category' },
      { path: 'table', select: 'number name' },
      { path: 'customer', select: 'name phone' },
      { path: 'cashier', select: 'name' }
    ]);

    // Emit real-time events for both orders and kitchen
    if (req.io) {
      req.io.to(`branch-${req.user.branch._id}`).emit('order-status-updated', order);
      req.io.to(`kitchen-${req.user.branch._id}`).emit('kitchen-order-updated', order);
      req.io.to(`pos-${req.user.branch._id}`).emit('order-updated', order);

      if (order.kitchenStatus === 'ready') {
        req.io.to(`branch-${req.user.branch._id}`).emit('order-ready', order);
      }
    }

    res.json({
      success: true,
      message: `Order updated successfully`,
      data: order
    });

  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update order status'
    });
  }
};

// Process payment
export const processPayment = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { paymentMethod, amount, notes } = req.body;

    const order = await Order.findOne({ _id: id, branch: req.user.branch._id }).session(session);
    if (!order) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.paymentStatus === 'paid') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Order is already paid'
      });
    }

    if (amount < order.finalTotal) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `Payment amount (${amount}) is less than order total (${order.finalTotal})`
      });
    }

    order.paymentMethod = paymentMethod;
    order.paymentStatus = 'paid';
    order.status = 'completed';
    order.completedAt = new Date();

    await order.save({ session });

    if (order.table) {
      await Table.findByIdAndUpdate(order.table, {
        status: 'available',
        currentSession: null
      }, { session });
    }

    if (order.customer) {
      const pointsEarned = Math.floor(order.finalTotal);
      await Customer.findByIdAndUpdate(order.customer, {
        $inc: {
          loyaltyPoints: pointsEarned,
          totalOrders: 1,
          totalSpent: order.finalTotal
        },
        lastOrder: new Date()
      }, { session });
    }

    await session.commitTransaction();
    session.endSession();

    if (req.io) {
      req.io.to(`branch-${req.user.branch._id}`).emit('order-completed', order);
      req.io.to(`kitchen-${req.user.branch._id}`).emit('order-completed', order);
    }

    res.json({
      success: true,
      message: 'Payment processed successfully',
      data: {
        order,
        change: amount - order.finalTotal
      }
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error('Process payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process payment'
    });
  }
};

// Get order statistics
export const getOrderStats = async (req, res) => {
  try {
    const { period = 'today' } = req.query;

    let startDate, endDate;
    const now = new Date();

    switch (period) {
      case 'today':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        endDate = new Date(now.setHours(23, 59, 59, 999));
        break;
      case 'week':
        startDate = new Date(now.setDate(now.getDate() - 7));
        endDate = new Date();
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date();
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date();
        break;
      default:
        startDate = new Date(now.setHours(0, 0, 0, 0));
        endDate = new Date(now.setHours(23, 59, 59, 999));
    }

    const match = {
      branch: req.user.branch._id,
      createdAt: { $gte: startDate, $lte: endDate }
    };

    const stats = await Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$finalTotal' },
          completedOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          pendingOrders: {
            $sum: { $cond: [{ $in: ['$status', ['pending', 'confirmed', 'preparing']] }, 1, 0] }
          },
          averageOrderValue: { $avg: '$finalTotal' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        period,
        overview: stats[0] || {
          totalOrders: 0,
          totalRevenue: 0,
          completedOrders: 0,
          pendingOrders: 0,
          averageOrderValue: 0
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
