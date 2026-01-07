// SQLite-only table controller
import { db } from '../db/index.js';

// Helper to format table response
const formatTable = (row) => {
  if (!row) return null;
  return {
    _id: row.id.toString(),
    id: row.id.toString(),
    number: row.number || row.tableNumber,
    tableNumber: row.tableNumber || row.number,
    name: row.name || `Table ${row.number || row.tableNumber}`,
    capacity: row.capacity || 4,
    location: row.location || 'indoor',
    status: row.status || 'available',
    branch: row.branch,
    createdAt: row.updated_at,
    updatedAt: row.updated_at
  };
};

// Get all tables - SQLite only
export const getTables = async (req, res) => {
  try {
    const branchId = req.user.branch._id || req.user.branch.id;

    const rows = db.prepare('SELECT * FROM tables WHERE branch = ? ORDER BY number ASC')
      .all(branchId.toString());

    const tables = rows.map(formatTable);

    res.json({
      success: true,
      data: tables,
      count: tables.length
    });
  } catch (error) {
    console.error('Get tables error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tables'
    });
  }
};

// Get available tables - SQLite only
export const getAvailableTables = async (req, res) => {
  try {
    const branchId = req.user.branch._id || req.user.branch.id;

    const rows = db.prepare('SELECT * FROM tables WHERE branch = ? AND status = ? ORDER BY number ASC')
      .all(branchId.toString(), 'available');

    const tables = rows.map(formatTable);

    res.json({
      success: true,
      data: tables
    });
  } catch (error) {
    console.error('Get available tables error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch available tables'
    });
  }
};

// Get single table - SQLite only
export const getTable = async (req, res) => {
  try {
    const tableId = req.params.id;
    const branchId = req.user.branch._id || req.user.branch.id;

    const table = db.prepare('SELECT * FROM tables WHERE id = ? AND branch = ?')
      .get(tableId, branchId.toString());

    if (!table) {
      return res.status(404).json({
        success: false,
        message: 'Table not found'
      });
    }

    res.json({
      success: true,
      data: formatTable(table)
    });
  } catch (error) {
    console.error('Get table error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch table'
    });
  }
};

// Create table - SQLite only
export const createTable = async (req, res) => {
  try {
    const { tableNumber, name, capacity, location } = req.body;
    const branchId = req.user.branch._id || req.user.branch.id;

    // Check if table number already exists
    const existingTable = db.prepare('SELECT * FROM tables WHERE number = ? AND branch = ?')
      .get(tableNumber, branchId.toString());

    if (existingTable) {
      return res.status(400).json({
        success: false,
        message: 'Table number already exists'
      });
    }

    const result = db.prepare(`
      INSERT INTO tables (number, tableNumber, name, capacity, location, status, branch)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      tableNumber,
      tableNumber,
      name || `Table ${tableNumber}`,
      parseInt(capacity) || 4,
      location || 'indoor',
      'available',
      branchId.toString()
    );

    const table = db.prepare('SELECT * FROM tables WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({
      success: true,
      data: formatTable(table),
      message: 'Table created successfully'
    });
  } catch (error) {
    console.error('Create table error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create table'
    });
  }
};

// Update table - SQLite only
export const updateTable = async (req, res) => {
  try {
    const tableId = req.params.id;
    const branchId = req.user.branch._id || req.user.branch.id;
    const { tableNumber, name, capacity, location } = req.body;

    // Check if table exists
    const existing = db.prepare('SELECT * FROM tables WHERE id = ? AND branch = ?')
      .get(tableId, branchId.toString());

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Table not found'
      });
    }

    // Check if table number already exists (excluding current table)
    if (tableNumber) {
      const duplicate = db.prepare('SELECT * FROM tables WHERE number = ? AND branch = ? AND id != ?')
        .get(tableNumber, branchId.toString(), tableId);

      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: 'Table number already exists'
        });
      }
    }

    // Build update query
    const updates = [];
    const params = [];

    if (tableNumber !== undefined) {
      updates.push('number = ?', 'tableNumber = ?');
      params.push(tableNumber, tableNumber);
    }
    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }
    if (capacity !== undefined) {
      updates.push('capacity = ?');
      params.push(parseInt(capacity));
    }
    if (location !== undefined) {
      updates.push('location = ?');
      params.push(location);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(tableId, branchId.toString());

    const query = `UPDATE tables SET ${updates.join(', ')} WHERE id = ? AND branch = ?`;
    db.prepare(query).run(...params);

    const table = db.prepare('SELECT * FROM tables WHERE id = ?').get(tableId);

    res.json({
      success: true,
      data: formatTable(table),
      message: 'Table updated successfully'
    });
  } catch (error) {
    console.error('Update table error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update table'
    });
  }
};

// Update table status - SQLite only
export const updateTableStatus = async (req, res) => {
  try {
    const tableId = req.params.id;
    const branchId = req.user.branch._id || req.user.branch.id;
    const { status, customers } = req.body;

    const table = db.prepare('SELECT * FROM tables WHERE id = ? AND branch = ?')
      .get(tableId, branchId.toString());

    if (!table) {
      return res.status(404).json({
        success: false,
        message: 'Table not found'
      });
    }

    db.prepare('UPDATE tables SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND branch = ?')
      .run(status, tableId, branchId.toString());

    const updatedTable = db.prepare('SELECT * FROM tables WHERE id = ?').get(tableId);

    res.json({
      success: true,
      data: formatTable(updatedTable),
      message: 'Table status updated successfully'
    });
  } catch (error) {
    console.error('Update table status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update table status'
    });
  }
};

// Delete table - SQLite only
export const deleteTable = async (req, res) => {
  try {
    const tableId = req.params.id;
    const branchId = req.user.branch._id || req.user.branch.id;

    const table = db.prepare('SELECT * FROM tables WHERE id = ? AND branch = ?')
      .get(tableId, branchId.toString());

    if (!table) {
      return res.status(404).json({
        success: false,
        message: 'Table not found'
      });
    }

    db.prepare('DELETE FROM tables WHERE id = ? AND branch = ?').run(tableId, branchId.toString());

    res.json({
      success: true,
      message: 'Table deleted successfully'
    });
  } catch (error) {
    console.error('Delete table error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete table'
    });
  }
};
