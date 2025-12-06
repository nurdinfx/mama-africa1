import express from 'express';
import { Transaction, FinancialReport } from '../models/Finance.js';
import Order from '../models/Order.js';
import { auth, authorize } from '../middleware/auth.js';

const router = express.Router();

// Get financial dashboard data
router.get('/dashboard', auth, authorize('admin', 'manager'), async (req, res) => {
  try {
    const today = new Date();
    const startOfToday = new Date(today.setHours(0, 0, 0, 0));
    const endOfToday = new Date(today.setHours(23, 59, 59, 999));

    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

    // Today's sales
    const todayOrders = await Order.find({
      createdAt: { $gte: startOfToday, $lte: endOfToday },
      paymentStatus: 'paid'
    });

    const todaySales = todayOrders.reduce((sum, order) => sum + order.finalAmount, 0);

    // Weekly sales
    const weekOrders = await Order.find({
      createdAt: { $gte: startOfWeek, $lte: endOfToday },
      paymentStatus: 'paid'
    });

    const weekSales = weekOrders.reduce((sum, order) => sum + order.finalAmount, 0);

    // Monthly sales
    const monthOrders = await Order.find({
      createdAt: { $gte: startOfMonth, $lte: endOfMonth },
      paymentStatus: 'paid'
    });

    const monthSales = monthOrders.reduce((sum, order) => sum + order.finalAmount, 0);

    // Recent transactions
    const recentTransactions = await Transaction.find()
      .populate('recordedBy', 'name')
      .sort({ date: -1 })
      .limit(10);

    // Sales by category (simplified)
    const categorySales = await Order.aggregate([
      { $match: { paymentStatus: 'paid', createdAt: { $gte: startOfMonth } } },
      { $unwind: '$items' },
      { $lookup: {
          from: 'menuitems',
          localField: 'items.menuItem',
          foreignField: '_id',
          as: 'menuItem'
        }
      },
      { $unwind: '$menuItem' },
      { $group: {
          _id: '$menuItem.category',
          total: { $sum: { $multiply: ['$items.quantity', '$items.price'] } }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        todaySales,
        weekSales,
        monthSales,
        todayOrders: todayOrders.length,
        recentTransactions,
        categorySales
      }
    });
  } catch (error) {
    console.error('Finance dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching finance data'
    });
  }
});

// Get all transactions
router.get('/transactions', auth, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      type = '',
      startDate = '',
      endDate = ''
    } = req.query;
    
    const query = {};
    
    if (type) {
      query.type = type;
    }
    
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const transactions = await Transaction.find(query)
      .populate('recordedBy', 'name')
      .populate('order')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ date: -1 });

    const total = await Transaction.countDocuments(query);

    res.json({
      success: true,
      data: {
        transactions,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        total
      }
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching transactions'
    });
  }
});

// Create transaction
router.post('/transactions', auth, authorize('admin', 'manager'), async (req, res) => {
  try {
    const transaction = new Transaction({
      ...req.body,
      recordedBy: req.user._id
    });

    await transaction.save();

    const populatedTransaction = await Transaction.findById(transaction._id)
      .populate('recordedBy', 'name')
      .populate('order');

    res.status(201).json({
      success: true,
      message: 'Transaction recorded successfully',
      data: { transaction: populatedTransaction }
    });
  } catch (error) {
    console.error('Create transaction error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating transaction'
    });
  }
});

// Generate financial report
router.post('/reports/generate', auth, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { period, startDate, endDate } = req.body;
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Get orders in period
    const orders = await Order.find({
      createdAt: { $gte: start, $lte: end },
      paymentStatus: 'paid'
    });

    // Get transactions in period
    const transactions = await Transaction.find({
      date: { $gte: start, $lte: end }
    });

    const totalIncome = orders.reduce((sum, order) => sum + order.finalAmount, 0);
    const totalExpenses = transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    const netProfit = totalIncome - totalExpenses;

    // Create or update report
    let report = await FinancialReport.findOne({ period });
    if (report) {
      report.totalIncome = totalIncome;
      report.totalExpenses = totalExpenses;
      report.netProfit = netProfit;
      report.transactions = transactions.map(t => t._id);
    } else {
      report = new FinancialReport({
        period,
        startDate: start,
        endDate: end,
        totalIncome,
        totalExpenses,
        netProfit,
        transactions: transactions.map(t => t._id)
      });
    }

    await report.save();

    res.json({
      success: true,
      message: 'Financial report generated successfully',
      data: { report }
    });
  } catch (error) {
    console.error('Generate report error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error generating financial report'
    });
  }
});

export default router;
