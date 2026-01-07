// SQLite-only finance controller
import { db } from '../db/index.js';

// Get financial dashboard data
export const getDashboardData = async (req, res) => {
    try {
        const branchId = req.user.branch._id || req.user.branch.id;

        // SQLite dates are stored as ISO strings
        const today = new Date();
        const startOfToday = new Date(today.setHours(0, 0, 0, 0)).toISOString();
        const endOfToday = new Date(today.setHours(23, 59, 59, 999)).toISOString();

        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        const startOfWeekStr = startOfWeek.toISOString();

        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();

        // Today's sales
        const todayStats = db.prepare(`
      SELECT 
        COUNT(*) as count,
        SUM(finalTotal) as total
      FROM orders
      WHERE branch = ? 
      AND createdAt >= ? AND createdAt <= ?
      AND (paymentStatus = 'paid' OR status = 'completed')
    `).get(branchId.toString(), startOfToday, endOfToday);

        const todaySales = todayStats.total || 0;
        const todayOrdersCount = todayStats.count || 0;

        // Weekly sales
        const weekStats = db.prepare(`
      SELECT SUM(finalTotal) as total
      FROM orders
      WHERE branch = ? 
      AND createdAt >= ? AND createdAt <= ?
      AND (paymentStatus = 'paid' OR status = 'completed')
    `).get(branchId.toString(), startOfWeekStr, endOfToday);

        const weekSales = weekStats.total || 0;

        // Monthly sales
        const monthStats = db.prepare(`
      SELECT SUM(finalTotal) as total
      FROM orders
      WHERE branch = ? 
      AND createdAt >= ? AND createdAt <= ?
      AND (paymentStatus = 'paid' OR status = 'completed')
    `).get(branchId.toString(), startOfMonth, endOfMonth);

        const monthSales = monthStats.total || 0;

        // Recent transactions (from finance table if it exists, or simulated from orders)
        // Checking finance table first
        const recentTransactions = db.prepare(`
      SELECT * FROM finance
      WHERE branch = ?
      ORDER BY date DESC
      LIMIT 10
    `).all(branchId.toString());

        // Sales by category
        // This requires a join with order_items and products
        const categoryStats = db.prepare(`
      SELECT 
        p.category,
        SUM(oi.total) as total
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      JOIN orders o ON oi.order_id = o.id
      WHERE o.branch = ?
      AND o.createdAt >= ?
      AND (o.paymentStatus = 'paid' OR o.status = 'completed')
      GROUP BY p.category
    `).all(branchId.toString(), startOfMonth);

        res.json({
            success: true,
            data: {
                todaySales,
                weekSales,
                monthSales,
                todayOrders: todayOrdersCount,
                recentTransactions: recentTransactions.map(t => ({
                    ...t,
                    _id: t.id.toString()
                })),
                categorySales: categoryStats.map(c => ({
                    _id: c.category || 'Uncategorized',
                    total: c.total
                }))
            }
        });
    } catch (error) {
        console.error('Finance dashboard error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching finance data'
        });
    }
};

// Get all transactions
export const getTransactions = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            type = '',
            startDate = '',
            endDate = ''
        } = req.query;

        const branchId = req.user.branch._id || req.user.branch.id;

        let query = 'SELECT * FROM finance WHERE branch = ?';
        const params = [branchId.toString()];

        if (type) {
            query += ' AND type = ?';
            params.push(type);
        }

        if (startDate) {
            query += ' AND date >= ?';
            params.push(startDate);
        }

        if (endDate) {
            query += ' AND date <= ?';
            params.push(endDate);
        }

        query += ' ORDER BY date DESC';

        // Get total count
        const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
        const totalResult = db.prepare(countQuery).get(...params);
        const total = totalResult.total || 0;

        // Apply pagination
        const offset = (parseInt(page) - 1) * parseInt(limit);
        query += ` LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), offset);

        const transactions = db.prepare(query).all(...params);

        res.json({
            success: true,
            data: {
                transactions: transactions.map(t => ({ ...t, _id: t.id.toString() })),
                totalPages: Math.ceil(total / limit),
                currentPage: parseInt(page),
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
};

// Create transaction
export const createTransaction = async (req, res) => {
    try {
        const { type, amount, description, date, category } = req.body;
        const branchId = req.user.branch._id || req.user.branch.id;

        if (!type || !amount || !description) {
            return res.status(400).json({
                success: false,
                message: 'Type, amount and description are required'
            });
        }

        const result = db.prepare(`
      INSERT INTO finance (type, amount, description, date, branch, category)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
            type,
            amount,
            description,
            date || new Date().toISOString(),
            branchId.toString(),
            category || 'General'
        );

        const transaction = db.prepare('SELECT * FROM finance WHERE id = ?').get(result.lastInsertRowid);

        res.status(201).json({
            success: true,
            message: 'Transaction recorded successfully',
            data: { transaction: { ...transaction, _id: transaction.id.toString() } }
        });
    } catch (error) {
        console.error('Create transaction error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error creating transaction'
        });
    }
};

// Generate financial report
export const generateReport = async (req, res) => {
    try {
        const { period, startDate, endDate } = req.body;
        const branchId = req.user.branch._id || req.user.branch.id;

        // Convert dates to string for SQLite comparison
        const start = new Date(startDate).toISOString();
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        const endStr = end.toISOString();

        // Get orders in period
        const ordersStats = db.prepare(`
        SELECT SUM(finalTotal) as totalIncome 
        FROM orders 
        WHERE branch = ? AND createdAt >= ? AND createdAt <= ? 
        AND (paymentStatus = 'paid' OR status = 'completed')
    `).get(branchId.toString(), start, endStr);

        // Get expense transactions in period
        const expenseStats = db.prepare(`
        SELECT SUM(amount) as totalExpenses 
        FROM finance 
        WHERE branch = ? AND type = 'expense' AND date >= ? AND date <= ?
    `).get(branchId.toString(), start, endStr);

        const totalIncome = ordersStats.totalIncome || 0;
        const totalExpenses = expenseStats.totalExpenses || 0;
        const netProfit = totalIncome - totalExpenses;

        const report = {
            period,
            startDate: start,
            endDate: endStr,
            totalIncome,
            totalExpenses,
            netProfit,
            generatedAt: new Date().toISOString()
        };

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
};
