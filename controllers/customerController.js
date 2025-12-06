// backend/controllers/customerController.js
import Customer from '../models/Customer.js';
import Ledger from '../models/Ledger.js';

// Get all customers with ledger summary
export const getCustomers = async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    
    const filter = { branch: req.user.branch._id };
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const customers = await Customer.find(filter)
      .select('name email phone address totalOrders currentBalance totalDebit totalCredit lastOrder')
      .sort({ name: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Customer.countDocuments(filter);

    res.json({
      success: true,
      data: {
        customers,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customers'
    });
  }
};

// Get single customer
export const getCustomer = async (req, res) => {
  try {
    const customer = await Customer.findOne({
      _id: req.params.id,
      branch: req.user.branch._id
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    res.json({
      success: true,
      data: customer
    });
  } catch (error) {
    console.error('Get customer error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customer'
    });
  }
};

// Create customer
export const createCustomer = async (req, res) => {
  try {
    const customerData = {
      ...req.body,
      branch: req.user.branch._id
    };

    const customer = new Customer(customerData);
    await customer.save();

    res.status(201).json({
      success: true,
      data: customer,
      message: 'Customer created successfully'
    });
  } catch (error) {
    console.error('Create customer error:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Customer with this phone number already exists'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Failed to create customer'
    });
  }
};

// Update customer
export const updateCustomer = async (req, res) => {
  try {
    const customer = await Customer.findOneAndUpdate(
      { _id: req.params.id, branch: req.user.branch._id },
      req.body,
      { new: true, runValidators: true }
    );

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    res.json({
      success: true,
      data: customer,
      message: 'Customer updated successfully'
    });
  } catch (error) {
    console.error('Update customer error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update customer'
    });
  }
};

// Delete customer
export const deleteCustomer = async (req, res) => {
  try {
    const customer = await Customer.findOneAndDelete({
      _id: req.params.id,
      branch: req.user.branch._id
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    res.json({
      success: true,
      message: 'Customer deleted successfully'
    });
  } catch (error) {
    console.error('Delete customer error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete customer'
    });
  }
};

// Search customers
export const searchCustomers = async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    const customers = await Customer.find({
      branch: req.user.branch._id,
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { phone: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } }
      ]
    }).limit(10);

    res.json({
      success: true,
      data: customers
    });
  } catch (error) {
    console.error('Search customers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search customers'
    });
  }
};

// Get customer ledger with proper balance calculation
export const getCustomerLedger = async (req, res) => {
  try {
    const { id } = req.params;
    
    const customer = await Customer.findOne({
      _id: id,
      branch: req.user.branch._id
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Get ledger transactions sorted by date (newest first)
    const ledgerTransactions = await Ledger.find({ 
      customer: id,
      branch: req.user.branch._id 
    })
    .sort({ date: -1, createdAt: -1 })
    .limit(100);

    // If no transactions found, return empty array
    res.json({
      success: true,
      data: ledgerTransactions
    });
  } catch (error) {
    console.error('Get customer ledger error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customer ledger'
    });
  }
};

// Add ledger transaction with balance calculation
export const addLedgerTransaction = async (req, res) => {
  try {
    const { customerId, type, amount, description, date } = req.body;
    
    const customer = await Customer.findOne({
      _id: customerId,
      branch: req.user.branch._id
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Calculate new balance
    const transactionAmount = parseFloat(amount);
    let newBalance = customer.currentBalance || 0;
    
    if (type === 'debit') {
      newBalance -= transactionAmount;
      customer.totalDebit = (customer.totalDebit || 0) + transactionAmount;
    } else {
      newBalance += transactionAmount;
      customer.totalCredit = (customer.totalCredit || 0) + transactionAmount;
    }

    customer.currentBalance = newBalance;

    // Create ledger transaction
    const newTransaction = new Ledger({
      customer: customerId,
      date: date ? new Date(date) : new Date(),
      type,
      amount: transactionAmount,
      description,
      balance: newBalance,
      branch: req.user.branch._id
    });

    // Save both customer and transaction
    await Promise.all([
      customer.save(),
      newTransaction.save()
    ]);

    res.json({
      success: true,
      message: 'Transaction added successfully',
      data: newTransaction
    });
  } catch (error) {
    console.error('Add ledger transaction error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add transaction'
    });
  }
};

// Get customer summary for dashboard
export const getCustomerSummary = async (req, res) => {
  try {
    const { id } = req.params;
    
    const customer = await Customer.findOne({
      _id: id,
      branch: req.user.branch._id
    }).select('name currentBalance totalDebit totalCredit totalOrders');

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Get transaction count
    const transactionCount = await Ledger.countDocuments({
      customer: id,
      branch: req.user.branch._id
    });

    // Get last transaction date
    const lastTransaction = await Ledger.findOne({
      customer: id,
      branch: req.user.branch._id
    }).sort({ date: -1 }).select('date');

    res.json({
      success: true,
      data: {
        currentBalance: customer.currentBalance || 0,
        totalDebit: customer.totalDebit || 0,
        totalCredit: customer.totalCredit || 0,
        totalTransactions: transactionCount,
        lastActivity: lastTransaction?.date || null,
        totalOrders: customer.totalOrders || 0
      }
    });
  } catch (error) {
    console.error('Get customer summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customer summary'
    });
  }
};