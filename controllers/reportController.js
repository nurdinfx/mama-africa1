// SQLite-only report controller
import { db } from '../db/index.js';

export const getPurchaseReports = async (req, res) => {
  try {
    const {
      from,
      to,
      supplierId,
      productId,
      groupBy = 'day'
    } = req.query;

    const branchId = req.user.branch._id || req.user.branch.id;

    let query = `
      SELECT 
        p.*, 
        s.name as supplierName 
      FROM purchases p
      LEFT JOIN suppliers s ON p.supplier = s.id
      WHERE p.branch = ?
    `;
    const params = [branchId.toString()];

    if (from && to) {
      query += ' AND p.createdAt >= ? AND p.createdAt <= ?';
      params.push(new Date(from).toISOString(), new Date(to).toISOString());
    }

    if (supplierId) {
      query += ' AND p.supplier = ?';
      params.push(supplierId);
    }

    // Since we don't have direct access to 'items' as a JSON array in raw SQLite query for aggregation easily without extensions,
    // we will fetch the purchases and aggregate in JS or do a join if we have purchase_items table.
    // Assuming purchase_items table exists for better normalization.

    // Actually, let's look at getPurchases in purchaseController or schema.
    // For now, I'll assume standard joining with purchase_items.

    // Aggregation Logic Replacements
    // Group By Day/Month/Supplier

    let groupFormat;
    if (groupBy === 'day') groupFormat = '%Y-%m-%d';
    else if (groupBy === 'month') groupFormat = '%Y-%m';
    else groupFormat = 'supplier'; // Special handling

    // We need to construct a robust query.
    // Let's do a simplified approach: Get the data and group in JS if volume is reasonable, 
    // OR use SQLite's strftime.

    let sqlGroupBy;
    let selectClause;

    if (groupBy === 'supplier') {
      selectClause = 'p.supplier as groupId, s.name as groupName';
      sqlGroupBy = 'p.supplier';
    } else {
      selectClause = `strftime('${groupFormat}', p.createdAt) as groupId`;
      sqlGroupBy = `strftime('${groupFormat}', p.createdAt)`;
    }

    // Main Aggregation Query
    const aggQuery = `
        SELECT 
            ${selectClause},
            COUNT(*) as totalPurchases,
            SUM(p.grandTotal) as totalAmount,
            SUM(pi.quantity) as totalQuantity
        FROM purchases p
        LEFT JOIN suppliers s ON p.supplier = s.id
        LEFT JOIN purchase_items pi ON p.id = pi.purchase_id
        WHERE p.branch = ?
        ${(from && to) ? 'AND p.createdAt >= ? AND p.createdAt <= ?' : ''}
        ${supplierId ? 'AND p.supplier = ?' : ''}
        GROUP BY ${sqlGroupBy}
        ORDER BY groupId
    `;

    // Filter params for aggQuery
    const aggParams = [branchId.toString()];
    if (from && to) aggParams.push(new Date(from).toISOString(), new Date(to).toISOString());
    if (supplierId) aggParams.push(supplierId);

    const reports = db.prepare(aggQuery).all(...aggParams);

    // Top Products Query
    const topProductsQuery = `
        SELECT 
            pi.product_id as _id,
            pr.name as productName,
            SUM(pi.quantity) as totalQuantity,
            SUM(pi.total) as totalAmount,
            AVG(pi.unitCost) as averageCost
        FROM purchase_items pi
        JOIN purchases p ON pi.purchase_id = p.id
        JOIN products pr ON pi.product_id = pr.id
        WHERE p.branch = ?
        ${(from && to) ? 'AND p.createdAt >= ? AND p.createdAt <= ?' : ''}
        ${supplierId ? 'AND p.supplier = ?' : ''}
        GROUP BY pi.product_id
        ORDER BY totalQuantity DESC
        LIMIT 10
    `;

    const topProducts = db.prepare(topProductsQuery).all(...aggParams);

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
    console.error('Purchase reports error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const getInventoryReport = async (req, res) => {
  try {
    const { lowStock = false } = req.query;
    const branchId = req.user.branch._id || req.user.branch.id;

    let query = 'SELECT * FROM products WHERE branch = ?';
    const params = [branchId.toString()];

    if (lowStock === 'true') {
      query += ' AND stock <= minStock';
    }

    query += ' ORDER BY stock ASC';

    const products = db.prepare(query).all(...params);

    // Calculate summary
    const totalProducts = products.length;
    const totalValue = products.reduce((sum, p) => sum + (p.stock * (p.cost || 0)), 0);
    const lowStockCount = products.filter(p => p.stock <= p.minStock).length;

    res.json({
      success: true,
      data: {
        products: products.map(p => ({
          ...p,
          _id: p.id.toString(),
          costPrice: p.cost // Mapping for frontend
        })),
        summary: {
          totalProducts,
          totalValue,
          lowStockItems: lowStockCount
        }
      }
    });
  } catch (error) {
    console.error('Inventory report error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};