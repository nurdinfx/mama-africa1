// backend/controllers/expenseController.js
import Expense from '../models/Expense.js';

// Get all expenses
export const getExpenses = async (req, res) => {
  try {
    const { category, startDate, endDate, page = 1, limit = 20 } = req.query;
    
    const filter = { branch: req.user.branch._id };
    
    if (category) filter.category = category;
    
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    const expenses = await Expense.find(filter)
      .populate('recordedBy', 'name')
      .sort({ date: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Expense.countDocuments(filter);
    
    const totalAmount = await Expense.aggregate([
      { $match: filter },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    res.json({
      success: true,
      data: {
        expenses,
        totalAmount: totalAmount[0]?.total || 0,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get expenses error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch expenses'
    });
  }
};

// Get single expense
export const getExpense = async (req, res) => {
  try {
    const expense = await Expense.findOne({
      _id: req.params.id,
      branch: req.user.branch._id
    }).populate('recordedBy', 'name');

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }

    res.json({
      success: true,
      data: expense
    });
  } catch (error) {
    console.error('Get expense error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch expense'
    });
  }
};

// Create expense
export const createExpense = async (req, res) => {
  try {
    const expenseData = {
      ...req.body,
      recordedBy: req.user._id,
      branch: req.user.branch._id
    };

    const expense = new Expense(expenseData);
    await expense.save();
    
    await expense.populate('recordedBy', 'name');

    res.status(201).json({
      success: true,
      data: expense,
      message: 'Expense recorded successfully'
    });
  } catch (error) {
    console.error('Create expense error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record expense'
    });
  }
};

// Update expense
export const updateExpense = async (req, res) => {
  try {
    const expense = await Expense.findOneAndUpdate(
      { _id: req.params.id, branch: req.user.branch._id },
      req.body,
      { new: true, runValidators: true }
    ).populate('recordedBy', 'name');

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }

    res.json({
      success: true,
      data: expense,
      message: 'Expense updated successfully'
    });
  } catch (error) {
    console.error('Update expense error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update expense'
    });
  }
};

// Delete expense
export const deleteExpense = async (req, res) => {
  try {
    const expense = await Expense.findOneAndDelete({
      _id: req.params.id,
      branch: req.user.branch._id
    });

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }

    res.json({
      success: true,
      message: 'Expense deleted successfully'
    });
  } catch (error) {
    console.error('Delete expense error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete expense'
    });
  }
};