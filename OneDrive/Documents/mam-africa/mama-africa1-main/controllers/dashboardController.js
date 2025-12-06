// backend/controllers/dashboardController.js
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Customer from '../models/Customer.js';
import Table from '../models/Table.js';
import Expense from '../models/Expense.js';

// Get dashboard stats
export const getStats = async (req, res) => {
  try {
    const today = new Date();
    const startOfToday = new Date(today.setHours(0, 0, 0, 0));
    const endOfToday = new Date(today.setHours(23, 59, 59, 999));
    
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const branchId = req.user.branch._id;

    // Today's stats
    const todayOrders = await Order.aggregate([
      {
        $match: {
          branch: branchId,
          createdAt: { $gte: startOfToday, $lte: endOfToday }
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$finalTotal' },
          totalOrders: { $sum: 1 },
          completedOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          }
        }
      }
    ]);

    // Monthly revenue
    const monthlyRevenue = await Order.aggregate([
      {
        $match: {
          branch: branchId,
          createdAt: { $gte: startOfMonth },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          revenue: { $sum: '$finalTotal' }
        }
      }
    ]);

    // Counts
    const totalCustomers = await Customer.countDocuments({ branch: branchId });
    const availableTables = await Table.countDocuments({ 
      branch: branchId, 
      status: 'available' 
    });
    const lowStockProducts = await Product.countDocuments({
      branch: branchId,
      stock: { $lte: 10 }
    });

    res.json({
      success: true,
      data: {
        todayRevenue: todayOrders[0]?.totalRevenue || 0,
        todayOrders: todayOrders[0]?.totalOrders || 0,
        completedOrders: todayOrders[0]?.completedOrders || 0,
        monthlyRevenue: monthlyRevenue[0]?.revenue || 0,
        totalCustomers,
        availableTables,
        lowStockProducts
      }
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard statistics'
    });
  }
};

// Get revenue data
export const getRevenueData = async (req, res) => {
  try {
    const { period = 'week' } = req.query;
    const branchId = req.user.branch._id;
    
    let startDate, groupFormat;
    const endDate = new Date();

    switch (period) {
      case 'week':
        startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 7);
        groupFormat = { 
          year: { $year: '$createdAt' }, 
          month: { $month: '$createdAt' }, 
          day: { $dayOfMonth: '$createdAt' } 
        };
        break;
      case 'month':
        startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
        groupFormat = { 
          year: { $year: '$createdAt' }, 
          month: { $month: '$createdAt' }, 
          day: { $dayOfMonth: '$createdAt' } 
        };
        break;
      case 'year':
        startDate = new Date(endDate.getFullYear(), 0, 1);
        groupFormat = { 
          year: { $year: '$createdAt' }, 
          month: { $month: '$createdAt' } 
        };
        break;
      default:
        startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 7);
        groupFormat = { 
          year: { $year: '$createdAt' }, 
          month: { $month: '$createdAt' }, 
          day: { $dayOfMonth: '$createdAt' } 
        };
    }

    const revenueData = await Order.aggregate([
      {
        $match: {
          branch: branchId,
          status: 'completed',
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: groupFormat,
          revenue: { $sum: '$finalTotal' },
          orders: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]);

    res.json({
      success: true,
      data: {
        period,
        revenueData
      }
    });
  } catch (error) {
    console.error('Get revenue data error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch revenue data'
    });
  }
};

// Get top products
export const getTopProducts = async (req, res) => {
  try {
    const { limit = 5, period = 'month' } = req.query;
    const branchId = req.user.branch._id;
    
    let startDate = new Date();
    switch (period) {
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
        break;
      case 'year':
        startDate = new Date(startDate.getFullYear(), 0, 1);
        break;
    }

    const topProducts = await Order.aggregate([
      {
        $match: {
          branch: branchId,
          createdAt: { $gte: startDate }
        }
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          totalQuantity: { $sum: '$items.quantity' },
          totalRevenue: { $sum: '$items.total' }
        }
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: parseInt(limit) },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $project: {
          name: '$product.name',
          category: '$product.category',
          totalQuantity: 1,
          totalRevenue: 1
        }
      }
    ]);

    res.json({
      success: true,
      data: topProducts
    });
  } catch (error) {
    console.error('Get top products error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch top products'
    });
  }
};

// Get recent activity
export const getRecentActivity = async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const branchId = req.user.branch._id;

    const recentOrders = await Order.find({ branch: branchId })
      .populate('cashier', 'name')
      .populate('customer', 'name')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    const recentExpenses = await Expense.find({ branch: branchId })
      .populate('recordedBy', 'name')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: {
        recentOrders,
        recentExpenses
      }
    });
  } catch (error) {
    console.error('Get recent activity error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recent activity'
    });
  }
};