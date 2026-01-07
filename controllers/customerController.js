// SQLite-only customer controller
import { db } from '../db/index.js';

// Get all customers with ledger summary
export const getCustomers = async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const branchId = req.user.branch._id || req.user.branch.id;

    let query = 'SELECT * FROM customers WHERE branch = ?';
    const params = [branchId.toString()];

    if (search) {
      query += ' AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    // Count
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
    const total = db.prepare(countQuery).get(...params).total || 0;

    // Apply Sort and Pagination
    query += ' ORDER BY name ASC LIMIT ? OFFSET ?';
    const offset = (parseInt(page) - 1) * parseInt(limit);
    params.push(parseInt(limit), offset);

    const customers = db.prepare(query).all(...params);

    // Get ledger summary for each customer
    const customersWithSummary = customers.map(c => {
      // Get total orders
      const orderStats = db.prepare('SELECT COUNT(*) as totalOrders, MAX(createdAt) as lastOrder FROM orders WHERE customer = ?').get(c.id.toString()) || { totalOrders: 0, lastOrder: null };

      // Get ledger balance
      const lastLedger = db.prepare('SELECT balance FROM customer_ledger WHERE customer = ? ORDER BY id DESC LIMIT 1').get(c.id.toString());

      return {
        ...c,
        _id: c.id.toString(),
        totalOrders: orderStats.totalOrders,
        lastOrder: orderStats.lastOrder,
        currentBalance: lastLedger ? lastLedger.balance : 0,
        totalDebit: 0, // Placeholder
        totalCredit: 0
      };
    });

    res.json({
      success: true,
      data: {
        customers: customersWithSummary,
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
    const { id } = req.params;
    const branchId = req.user.branch._id || req.user.branch.id;

    const customer = db.prepare('SELECT * FROM customers WHERE id = ? AND branch = ?').get(id, branchId.toString());

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    res.json({
      success: true,
      data: { ...customer, _id: customer.id.toString() }
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
    const { name, phone, email, address } = req.body;
    const branchId = req.user.branch._id || req.user.branch.id;

    const existing = db.prepare('SELECT * FROM customers WHERE phone = ? AND branch = ?').get(phone, branchId.toString());
    if (existing) {
      return res.status(400).json({ success: false, message: 'Customer with this phone number already exists' });
    }

    const result = db.prepare(`
        INSERT INTO customers (name, phone, email, branch)
        VALUES (?, ?, ?, ?)
    `).run(name, phone, email, branchId.toString());

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({
      success: true,
      data: { ...customer, _id: customer.id.toString() },
      message: 'Customer created successfully'
    });
  } catch (error) {
    console.error('Create customer error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create customer'
    });
  }
};

// Update customer
export const updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, email } = req.body;
    const branchId = req.user.branch._id || req.user.branch.id;

    const existing = db.prepare('SELECT * FROM customers WHERE id = ? AND branch = ?').get(id, branchId.toString());
    if (!existing) return res.status(404).json({ success: false, message: 'Customer not found' });

    const updates = [];
    const params = [];
    if (name) { updates.push('name = ?'); params.push(name); }
    if (phone) { updates.push('phone = ?'); params.push(phone); }
    if (email) { updates.push('email = ?'); params.push(email); }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id, branchId.toString());

    db.prepare(`UPDATE customers SET ${updates.join(', ')} WHERE id = ? AND branch = ?`).run(...params);

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);

    res.json({
      success: true,
      data: { ...customer, _id: customer.id.toString() },
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
    const { id } = req.params;
    const branchId = req.user.branch._id || req.user.branch.id;

    const result = db.prepare('DELETE FROM customers WHERE id = ? AND branch = ?').run(id, branchId.toString());

    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    res.json({ success: true, message: 'Customer deleted successfully' });
  } catch (error) {
    console.error('Delete customer error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete customer' });
  }
};

// Search customers
export const searchCustomers = async (req, res) => {
  try {
    const { query } = req.query;
    const branchId = req.user.branch._id || req.user.branch.id;

    if (!query) return res.status(400).json({ success: false, message: 'Search query is required' });

    const customers = db.prepare(`
        SELECT * FROM customers 
        WHERE branch = ? AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)
        LIMIT 10
    `).all(branchId.toString(), `%${query}%`, `%${query}%`, `%${query}%`);

    res.json({
      success: true,
      data: customers.map(c => ({ ...c, _id: c.id.toString() }))
    });
  } catch (error) {
    console.error('Search customers error:', error);
    res.status(500).json({ success: false, message: 'Failed to search customers' });
  }
};

// Get customer ledger
export const getCustomerLedger = async (req, res) => {
  try {
    const { id } = req.params;
    const branchId = req.user.branch._id || req.user.branch.id;

    const customer = db.prepare('SELECT * FROM customers WHERE id = ? AND branch = ?').get(id, branchId.toString());
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

    const ledgerTransactions = db.prepare(`
        SELECT * FROM customer_ledger 
        WHERE customer = ? AND branch = ? 
        ORDER BY date DESC, id DESC LIMIT 100
    `).all(id, branchId.toString());

    res.json({
      success: true,
      data: ledgerTransactions.map(l => ({ ...l, _id: l.id.toString() }))
    });
  } catch (error) {
    console.error('Get customer ledger error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch customer ledger' });
  }
};

// Add ledger transaction
export const addLedgerTransaction = async (req, res) => {
  try {
    const { customerId, type, amount, description, date } = req.body;
    const branchId = req.user.branch._id || req.user.branch.id;

    const customer = db.prepare('SELECT * FROM customers WHERE id = ? AND branch = ?').get(customerId, branchId.toString());
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

    // Calculate new balance
    // Get last balance
    const lastTx = db.prepare('SELECT balance FROM customer_ledger WHERE customer = ? ORDER BY id DESC LIMIT 1').get(customerId);
    let currentBalance = lastTx ? lastTx.balance : 0;
    const txAmount = parseFloat(amount);

    if (type === 'debit') {
      currentBalance -= txAmount;
    } else {
      currentBalance += txAmount;
    }

    const txResult = db.prepare(`
        INSERT INTO customer_ledger (customer, transactionType, amount, balance, description, date, branch)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      customerId,
      type,
      txAmount,
      currentBalance,
      description,
      date ? new Date(date).toISOString() : new Date().toISOString(),
      branchId.toString()
    );

    const newTransaction = db.prepare('SELECT * FROM customer_ledger WHERE id = ?').get(txResult.lastInsertRowid);

    res.json({
      success: true,
      message: 'Transaction added successfully',
      data: { ...newTransaction, _id: newTransaction.id.toString() }
    });
  } catch (error) {
    console.error('Add ledger transaction error:', error);
    res.status(500).json({ success: false, message: 'Failed to add transaction' });
  }
};

// Get customer summary for dashboard
export const getCustomerSummary = async (req, res) => {
  try {
    const { id } = req.params;
    const branchId = req.user.branch._id || req.user.branch.id;

    const customer = db.prepare('SELECT * FROM customers WHERE id = ? AND branch = ?').get(id, branchId.toString());
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

    const totalOrders = db.prepare('SELECT COUNT(*) as count FROM orders WHERE customer = ?').get(id.toString()).count || 0;

    // Total transactions
    const txCount = db.prepare('SELECT COUNT(*) as count FROM customer_ledger WHERE customer = ?').get(id).count || 0;

    const lastTx = db.prepare('SELECT * FROM customer_ledger WHERE customer = ? ORDER BY id DESC LIMIT 1').get(id);
    const balance = lastTx ? lastTx.balance : 0;

    res.json({
      success: true,
      data: {
        currentBalance: balance,
        totalDebit: 0,
        totalCredit: 0,
        totalTransactions: txCount,
        lastActivity: lastTx ? lastTx.date : null,
        totalOrders: totalOrders
      }
    });

  } catch (error) {
    console.error('Get customer summary error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch customer summary' });
  }
};