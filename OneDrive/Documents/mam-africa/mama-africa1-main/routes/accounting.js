import express from 'express';
import { FinancialReport, Transaction } from '../models/Finance.js';
import Order from '../models/Order.js';
import { auth, authorize } from '../middleware/auth.js';

const router = express.Router();

// Get balance sheet
router.get('/balance-sheet', auth, authorize('admin'), async (req, res) => {
  try {
    const { asOf } = req.query;
    const asOfDate = asOf ? new Date(asOf) : new Date();

    // This is a simplified balance sheet
    const assets = await Transaction.aggregate([
      {
        $match: {
          type: 'income',
          date: { $lte: asOfDate }
        }
      },
      {
        $group: {
          _id: null,
          totalAssets: { $sum: '$amount' }
        }
      }
    ]);

    const liabilities = await Transaction.aggregate([
      {
        $match: {
          type: 'expense',
          date: { $lte: asOfDate }
        }
      },
      {
        $group: {
          _id: null,
          totalLiabilities: { $sum: '$amount' }
        }
      }
    ]);

    const totalAssets = assets[0]?.totalAssets || 0;
    const totalLiabilities = liabilities[0]?.totalLiabilities || 0;
    const equity = totalAssets - totalLiabilities;

    res.json({
      success: true,
      data: {
        asOf: asOfDate,
        assets: {
          cash: totalAssets * 0.7, // Simplified
          inventory: totalAssets * 0.3, // Simplified
          totalAssets
        },
        liabilities: {
          accountsPayable: totalLiabilities * 0.6, // Simplified
          loans: totalLiabilities * 0.4, // Simplified
          totalLiabilities
        },
        equity
      }
    });
  } catch (error) {
    console.error('Balance sheet error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error generating balance sheet'
    });
  }
});

// Get income statement
router.get('/income-statement', auth, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const revenue = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          paymentStatus: 'paid'
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$finalAmount' }
        }
      }
    ]);

    const expenses = await Transaction.aggregate([
      {
        $match: {
          type: 'expense',
          date: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: '$category',
          amount: { $sum: '$amount' }
        }
      }
    ]);

    const totalRevenue = revenue[0]?.totalRevenue || 0;
    const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);
    const netIncome = totalRevenue - totalExpenses;

    res.json({
      success: true,
      data: {
        period: { startDate: start, endDate: end },
        revenue: {
          total: totalRevenue,
          byCategory: await getRevenueByCategory(start, end)
        },
        expenses: {
          total: totalExpenses,
          byCategory: expenses
        },
        netIncome
      }
    });
  } catch (error) {
    console.error('Income statement error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error generating income statement'
    });
  }
});

// Helper function to get revenue by category
async function getRevenueByCategory(start, end) {
  return await Order.aggregate([
    {
      $match: {
        createdAt: { $gte: start, $lte: end },
        paymentStatus: 'paid'
      }
    },
    { $unwind: '$items' },
    {
      $lookup: {
        from: 'menuitems',
        localField: 'items.menuItem',
        foreignField: '_id',
        as: 'menuItem'
      }
    },
    { $unwind: '$menuItem' },
    {
      $group: {
        _id: '$menuItem.category',
        revenue: { $sum: { $multiply: ['$items.quantity', '$items.price'] } }
      }
    }
  ]);
}

// Export financial data
router.get('/export', auth, authorize('admin'), async (req, res) => {
  try {
    const { format = 'json', startDate, endDate } = req.query;
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const transactions = await Transaction.find({
      date: { $gte: start, $lte: end }
    }).populate('recordedBy', 'name');

    const orders = await Order.find({
      createdAt: { $gte: start, $lte: end }
    }).populate('items.menuItem');

    if (format === 'csv') {
      // Simplified CSV export
      const csvData = transactions.map(t => 
        `${t.date},${t.type},${t.category},${t.amount},${t.description}`
      ).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=financial-data-${startDate}-to-${endDate}.csv`);
      return res.send('Date,Type,Category,Amount,Description\n' + csvData);
    }

    res.json({
      success: true,
      data: {
        transactions,
        orders,
        summary: {
          totalTransactions: transactions.length,
          totalOrders: orders.length,
          period: { startDate: start, endDate: end }
        }
      }
    });
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error exporting data'
    });
  }
});

export default router;
