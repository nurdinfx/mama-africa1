// SQLite-only expense controller
import { db } from '../db/index.js';

// Get all expenses
export const getExpenses = async (req, res) => {
  try {
    const { category, startDate, endDate, page = 1, limit = 20 } = req.query;
    const branchId = req.user.branch._id || req.user.branch.id;

    let query = 'SELECT e.*, u.name as recordedByName FROM expenses e LEFT JOIN users u ON e.createdBy = u.id WHERE e.branch = ?';
    const params = [branchId.toString()];

    if (category) {
      query += ' AND e.category = ?';
      params.push(category);
    }

    if (startDate) {
      query += ' AND e.date >= ?';
      params.push(new Date(startDate).toISOString());
    }

    if (endDate) {
      query += ' AND e.date <= ?';
      params.push(new Date(endDate).toISOString());
    }

    // Count for pagination
    const countQuery = query.replace('SELECT e.*, u.name as recordedByName', 'SELECT COUNT(*) as total');
    const total = db.prepare(countQuery).get(...params).total || 0;

    // Total Amount Summary
    const sumQuery = query.replace('SELECT e.*, u.name as recordedByName', 'SELECT SUM(amount) as totalAmount');
    const totalAmount = db.prepare(sumQuery).get(...params).totalAmount || 0;

    // Apply Sort and Pagination
    query += ' ORDER BY e.date DESC LIMIT ? OFFSET ?';
    const offset = (parseInt(page) - 1) * parseInt(limit);
    params.push(parseInt(limit), offset);

    const expenses = db.prepare(query).all(...params);

    res.json({
      success: true,
      data: {
        expenses: expenses.map(e => ({
          ...e,
          _id: e.id.toString(),
          recordedBy: { name: e.recordedByName } // Match population structure
        })),
        totalAmount,
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
    const { id } = req.params;
    const branchId = req.user.branch._id || req.user.branch.id;

    const expense = db.prepare(`
        SELECT e.*, u.name as recordedByName 
        FROM expenses e 
        LEFT JOIN users u ON e.createdBy = u.id 
        WHERE e.id = ? AND e.branch = ?
    `).get(id, branchId.toString());

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }

    res.json({
      success: true,
      data: {
        ...expense,
        _id: expense.id.toString(),
        recordedBy: { name: expense.recordedByName }
      }
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
    const { description, amount, category, date } = req.body;
    const branchId = req.user.branch._id || req.user.branch.id;
    const userId = req.user._id || req.user.id;

    const result = db.prepare(`
        INSERT INTO expenses (description, amount, category, date, branch, createdBy)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      description,
      amount,
      category,
      date ? new Date(date).toISOString() : new Date().toISOString(),
      branchId.toString(),
      userId.toString()
    );

    const expense = db.prepare(`
        SELECT e.*, u.name as recordedByName 
        FROM expenses e 
        LEFT JOIN users u ON e.createdBy = u.id 
        WHERE e.id = ?
    `).get(result.lastInsertRowid);

    // Also record in Finance/Ledger potentially if using finance table too?
    // In financeController we pull from finance table.
    // Ideally we should double-write or financeController should read expenses table.
    // BUT `financeController` (migrated) reads `finance` table.
    // `expenseController` writes `expenses` table.
    // If they are separate in SQLite schema, they are separate.
    // The `services/sqlite.js` has both `expenses` and `finance`.
    // We should probably write to `finance` too for unified reporting if that's how it works.
    // "Finance" table has type='expense'.
    // Let's add to finance table to keep dashboard accurate.

    db.prepare(`
        INSERT INTO finance (type, amount, description, date, branch, category)
        VALUES ('expense', ?, ?, ?, ?, ?)
    `).run(
      amount,
      description,
      date ? new Date(date).toISOString() : new Date().toISOString(),
      branchId.toString(),
      category
    );

    res.status(201).json({
      success: true,
      data: {
        ...expense,
        _id: expense.id.toString(),
        recordedBy: { name: expense.recordedByName }
      },
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
    const { id } = req.params;
    const { description, amount, category, date } = req.body;
    const branchId = req.user.branch._id || req.user.branch.id;

    const existing = db.prepare('SELECT * FROM expenses WHERE id = ? AND branch = ?').get(id, branchId.toString());
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }

    const updates = [];
    const params = [];

    if (description) { updates.push('description = ?'); params.push(description); }
    if (amount) { updates.push('amount = ?'); params.push(amount); }
    if (category) { updates.push('category = ?'); params.push(category); }
    if (date) { updates.push('date = ?'); params.push(new Date(date).toISOString()); }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id, branchId.toString());

    db.prepare(`UPDATE expenses SET ${updates.join(', ')} WHERE id = ? AND branch = ?`).run(...params);

    const expense = db.prepare(`
        SELECT e.*, u.name as recordedByName 
        FROM expenses e 
        LEFT JOIN users u ON e.createdBy = u.id 
        WHERE e.id = ?
    `).get(id);

    // Note: Updating `finance` table entry is harder because we didn't link them with an ID reference.
    // For now, ignoring finance update on edit (Limitation).

    res.json({
      success: true,
      data: {
        ...expense,
        _id: expense.id.toString(),
        recordedBy: { name: expense.recordedByName }
      },
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
    const { id } = req.params;
    const branchId = req.user.branch._id || req.user.branch.id;

    const result = db.prepare('DELETE FROM expenses WHERE id = ? AND branch = ?').run(id, branchId.toString());

    if (result.changes === 0) {
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