import mongoose from 'mongoose';
import Purchase from '../models/Purchase.js';
import Product from '../models/Product.js';

export const createPurchase = async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    session.startTransaction();
    
    const { supplierId, items, paymentMethod, notes } = req.body;
    const userId = req.user._id;
    const branchId = req.user.branch._id;

    console.log('Creating purchase with data:', { supplierId, items, paymentMethod, notes });

    // Validate required fields
    if (!supplierId || !items || !Array.isArray(items) || items.length === 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Supplier and at least one item are required'
      });
    }

    // Calculate totals and validate items
    let subtotal = 0;
    let taxTotal = 0;
    let discountTotal = 0;
    const validatedItems = [];

    for (const item of items) {
      // Validate item fields
      if (!item.productId || !item.qty || !item.unitCost) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Each item must have productId, quantity, and unitCost'
        });
      }

      // Verify product exists and belongs to branch
      const product = await Product.findOne({
        _id: item.productId,
        branch: branchId
      }).session(session);

      if (!product) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: `Product not found: ${item.productId}`
        });
      }

      const baseAmount = item.qty * item.unitCost;
      const discountAmount = baseAmount * ((item.discount || 0) / 100);
      const taxAmount = (baseAmount - discountAmount) * ((item.tax || 0) / 100);
      const total = baseAmount - discountAmount + taxAmount;

      subtotal += baseAmount;
      discountTotal += discountAmount;
      taxTotal += taxAmount;

      validatedItems.push({
        productId: item.productId,
        qty: item.qty,
        unitCost: item.unitCost,
        discount: item.discount || 0,
        tax: item.tax || 0,
        total: Math.round(total * 100) / 100
      });

      // Update product stock and cost
      product.stock += item.qty;
      product.cost = item.unitCost; // Update latest cost
      await product.save({ session });
    }

    const grandTotal = subtotal - discountTotal + taxTotal;

    const purchase = new Purchase({
      supplierId,
      items: validatedItems,
      subtotal: Math.round(subtotal * 100) / 100,
      taxTotal: Math.round(taxTotal * 100) / 100,
      discountTotal: Math.round(discountTotal * 100) / 100,
      grandTotal: Math.round(grandTotal * 100) / 100,
      paymentMethod: paymentMethod || 'cash',
      branch: branchId,
      createdBy: userId,
      notes: notes || '',
      status: 'submitted'
    });

    await purchase.save({ session });
    await session.commitTransaction();

    // Populate the purchase for response
    const populatedPurchase = await Purchase.findById(purchase._id)
      .populate('supplierId', 'name contact email')
      .populate('items.productId', 'name category cost price')
      .populate('createdBy', 'name email');

    // Emit real-time events
    if (req.io) {
      req.io.to(`branch-${branchId}`).emit('purchase-created', populatedPurchase);
      req.io.to(`inventory-${branchId}`).emit('inventory-updated');
    }

    res.status(201).json({
      success: true,
      data: populatedPurchase,
      message: 'Purchase created successfully'
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Create purchase error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create purchase'
    });
  } finally {
    session.endSession();
  }
};

export const getPurchases = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    const branchId = req.user.branch._id;

    const filter = { branch: branchId };

    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const purchases = await Purchase.find(filter)
      .populate('supplierId', 'name contact email')
      .populate('items.productId', 'name category cost')
      .populate('createdBy', 'name email')
      .sort(sort)
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await Purchase.countDocuments(filter);

    res.json({
      success: true,
      data: {
        purchases,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      }
    });
  } catch (error) {
    console.error('Get purchases error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const getDailyPurchases = async (req, res) => {
  try {
    const { date } = req.query;
    const branchId = req.user.branch._id;
    
    const targetDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));

    const purchases = await Purchase.find({
      branch: branchId,
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    })
    .populate('supplierId', 'name contact')
    .populate('items.productId', 'name category')
    .sort({ createdAt: -1 });

    const dailySummary = await Purchase.aggregate([
      {
        $match: {
          branch: mongoose.Types.ObjectId(branchId),
          createdAt: { $gte: startOfDay, $lte: endOfDay }
        }
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$grandTotal' },
          totalPurchases: { $sum: 1 },
          averagePurchase: { $avg: '$grandTotal' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        purchases,
        summary: dailySummary[0] || {
          totalAmount: 0,
          totalPurchases: 0,
          averagePurchase: 0
        }
      }
    });
  } catch (error) {
    console.error('Get daily purchases error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};