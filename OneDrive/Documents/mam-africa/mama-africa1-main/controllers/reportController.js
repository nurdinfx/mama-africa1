import Purchase from '../models/Purchase.js';
import Product from '../models/Product.js';
import Supplier from '../models/Supplier.js';

export const getPurchaseReports = async (req, res) => {
  try {
    const { 
      from, 
      to, 
      supplierId, 
      productId,
      groupBy = 'day'
    } = req.query;

    const matchStage = {};
    
    if (from && to) {
      matchStage.createdAt = {
        $gte: new Date(from),
        $lte: new Date(to)
      };
    }
    
    if (supplierId) matchStage.supplierId = supplierId;

    let groupStage = {};
    switch (groupBy) {
      case 'day':
        groupStage = {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          date: { $first: '$createdAt' }
        };
        break;
      case 'month':
        groupStage = {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          date: { $first: '$createdAt' }
        };
        break;
      case 'supplier':
        groupStage = {
          _id: '$supplierId'
        };
        break;
      default:
        groupStage = {
          _id: null
        };
    }

    const pipeline = [
      { $match: matchStage },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.productId',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $group: {
          ...groupStage,
          totalPurchases: { $sum: 1 },
          totalAmount: { $sum: '$grandTotal' },
          totalQuantity: { $sum: '$items.qty' },
          products: {
            $push: {
              productId: '$items.productId',
              productName: '$product.name',
              quantity: '$items.qty',
              amount: '$items.total'
            }
          }
        }
      },
      { $sort: { '_id': 1 } }
    ];

    // Add supplier lookup if grouping by supplier
    if (groupBy === 'supplier') {
      pipeline.push({
        $lookup: {
          from: 'suppliers',
          localField: '_id',
          foreignField: '_id',
          as: 'supplier'
        }
      });
      pipeline.push({ $unwind: '$supplier' });
    }

    const reports = await Purchase.aggregate(pipeline);

    // Get top purchased products
    const topProducts = await Purchase.aggregate([
      { $match: matchStage },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.productId',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $group: {
          _id: '$items.productId',
          productName: { $first: '$product.name' },
          totalQuantity: { $sum: '$items.qty' },
          totalAmount: { $sum: '$items.total' },
          averageCost: { $avg: '$items.unitCost' }
        }
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      success: true,
      data: {
        reports,
        topProducts,
        summary: {
          totalReports: reports.length,
          totalProducts: topProducts.length
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const getInventoryReport = async (req, res) => {
  try {
    const { lowStock = false } = req.query;

    const matchStage = {};
    if (lowStock === 'true') {
      matchStage.$expr = { $lte: ['$stock', '$minStock'] };
    }

    const products = await Product.find(matchStage)
      .populate('supplierId', 'name')
      .sort({ stock: 1 });

    const inventorySummary = await Product.aggregate([
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          totalValue: { $sum: { $multiply: ['$stock', '$costPrice'] } },
          lowStockItems: {
            $sum: {
              $cond: [{ $lte: ['$stock', '$minStock'] }, 1, 0]
            }
          }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        products,
        summary: inventorySummary[0] || {
          totalProducts: 0,
          totalValue: 0,
          lowStockItems: 0
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};