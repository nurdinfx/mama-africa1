// SQLite-only dashboard controller
import { db } from '../db/index.js';

// Get dashboard stats
export const getStats = async (req, res) => {
  try {
    const { period = 'today' } = req.query;
    const branchId = req.user.branch._id || req.user.branch.id;

    let startDate = new Date();
    let endDate = new Date();
    const today = new Date();

    // Set end of today
    endDate.setHours(23, 59, 59, 999);

    if (period === 'today') {
      startDate.setHours(0, 0, 0, 0);
    } else if (period === 'week') {
      startDate.setDate(today.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
    } else if (period === 'month') {
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
    } else if (period === 'year') {
      startDate.setMonth(0, 1);
      startDate.setHours(0, 0, 0, 0);
    }

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // SQLite queries
    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();
    const startMonthIso = startOfMonth.toISOString();
    const branchStr = branchId.toString();

    // 1. Stats based on Orders
    const statsQuery = `
        SELECT 
            SUM(grandTotal) as totalRevenue,
            COUNT(*) as totalOrders,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completedOrders,
            AVG(grandTotal) as avgOrderValue,
            SUM(CASE WHEN status IN ('pending', 'preparing', 'ready') THEN 1 ELSE 0 END) as pendingOrders
        FROM orders
        WHERE branch = ? AND updated_at >= ? AND updated_at <= ?
    `;
    const stats = db.prepare(statsQuery).get(branchStr, startIso, endIso) || {};

    // 2. Monthly Revenue
    const monthlyRevenue = db.prepare(`
        SELECT SUM(grandTotal) as revenue 
        FROM orders 
        WHERE branch = ? AND status = 'completed' AND updated_at >= ?
    `).get(branchStr, startMonthIso)?.revenue || 0;

    // 3. Counts
    const totalCustomers = db.prepare('SELECT COUNT(*) as count FROM customers WHERE branch = ?').get(branchStr).count;
    const availableTables = db.prepare('SELECT COUNT(*) as count FROM tables WHERE branch = ? AND status = ?').get(branchStr, 'available').count;
    const lowStockProducts = db.prepare('SELECT COUNT(*) as count FROM products WHERE branch = ? AND stock <= 10').get(branchStr).count;

    res.json({
      success: true,
      data: {
        todayRevenue: stats.totalRevenue || 0,
        todayOrders: stats.totalOrders || 0,
        completedOrders: stats.completedOrders || 0,
        averageOrderValue: stats.avgOrderValue || 0,
        pendingOrders: stats.pendingOrders || 0,
        monthlyRevenue,
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

// Get revenue data for chart
export const getRevenueData = async (req, res) => {
  try {
    const { period = 'week' } = req.query;
    const branchId = req.user.branch._id || req.user.branch.id;

    let startDate = new Date();
    // Logic similar to original but handled by SQLite grouping
    if (period === 'week') startDate.setDate(startDate.getDate() - 7);
    else if (period === 'month') startDate.setMonth(startDate.getMonth(), 1);
    else if (period === 'year') startDate.setMonth(0, 1);
    else startDate.setDate(startDate.getDate() - 7);

    const startIso = startDate.toISOString();
    const branchStr = branchId.toString();

    // Group by day using strftime
    // Note: 'year' grouping is slightly different, but let's stick to daily breakdown for week/month 
    // and monthly for year if possible. For simplicity, daily breakdown for all or robust switch.

    let dateFormat = '%Y-%m-%d';
    if (period === 'year') dateFormat = '%Y-%m';

    const query = `
        SELECT 
            strftime(?, updated_at) as date,
            SUM(grandTotal) as revenue,
            COUNT(*) as orders
        FROM orders
        WHERE branch = ? AND status = 'completed' AND updated_at >= ?
        GROUP BY date
        ORDER BY date ASC
    `;

    const revenueData = db.prepare(query).all(dateFormat, branchStr, startIso);

    // Transform to expected format if needed, but array of objects {date, revenue, orders} is standard chart data.
    // Original aggregation returned _id: {year, month, day}.
    // We can map this simple result to match that if frontend expects it strictly, 
    // OR just return the friendly list. 
    // Let's check frontend or just return standard list. 
    // Usually chart libraries take date string.

    // Attempting to match legacy structure roughly or providing enough info
    // Legacy: _id: { year: 2023, month: 10, day: 5 }
    // Let's create `_id` compatible object
    const formattedData = revenueData.map(r => {
      const d = new Date(r.date);
      return {
        _id: {
          year: d.getFullYear(),
          month: d.getMonth() + 1,
          day: period === 'year' ? 1 : d.getDate()
        },
        revenue: r.revenue,
        orders: r.orders
      };
    });

    res.json({
      success: true,
      data: {
        period,
        revenueData: formattedData
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
    const branchId = req.user.branch._id || req.user.branch.id;

    let startDate = new Date();
    if (period === 'week') startDate.setDate(startDate.getDate() - 7);
    else if (period === 'month') startDate.setDate(1); // Start of month ? logic was "start of current month"
    else if (period === 'year') startDate.setMonth(0, 1);

    const startIso = startDate.toISOString();
    const branchStr = branchId.toString();
    const limitInt = parseInt(limit);

    // This is tricky in SQLite without explicit order_items table for normalized Order model.
    // BUT `sqlite.js` does define `order_items` table!
    // So we can join.

    const query = `
        SELECT 
            p.name,
            p.category,
            SUM(oi.quantity) as totalQuantity,
            SUM(oi.subtotal) as totalRevenue
        FROM order_items oi
        JOIN orders o ON oi.orderId = o.id
        JOIN products p ON oi.product = p.id
        WHERE o.branch = ? AND o.updated_at >= ?
        GROUP BY p.id
        ORDER BY totalQuantity DESC
        LIMIT ?
    `;

    const topProducts = db.prepare(query).all(branchStr, startIso, limitInt);

    res.json({
      success: true,
      data: topProducts.map(tp => ({
        _id: null, // Legacy field
        name: tp.name,
        category: tp.category,
        totalQuantity: tp.totalQuantity,
        totalRevenue: tp.totalRevenue
      }))
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
    const branchId = req.user.branch._id || req.user.branch.id;
    const limitInt = parseInt(limit);
    const branchStr = branchId.toString();

    // Recent Orders
    const recentOrders = db.prepare(`
        SELECT o.*, u.name as cashierName, c.name as customerName
        FROM orders o
        LEFT JOIN users u ON o.cashier = u.id
        LEFT JOIN customers c ON o.customer = c.id
        WHERE o.branch = ?
        ORDER BY o.updated_at DESC
        LIMIT ?
    `).all(branchStr, limitInt);

    // Recent Expenses
    const recentExpenses = db.prepare(`
        SELECT e.*, u.name as recordedByName
        FROM expenses e
        LEFT JOIN users u ON e.createdBy = u.id
        WHERE e.branch = ?
        ORDER BY e.updated_at DESC
        LIMIT ?
    `).all(branchStr, limitInt);

    res.json({
      success: true,
      data: {
        recentOrders: recentOrders.map(o => ({
          ...o,
          _id: o.id.toString(),
          cashier: { name: o.cashierName },
          customer: { name: o.customerName }
        })),
        recentExpenses: recentExpenses.map(e => ({
          ...e,
          _id: e.id.toString(),
          recordedBy: { name: e.recordedByName }
        }))
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