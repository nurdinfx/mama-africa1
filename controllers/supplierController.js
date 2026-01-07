// SQLite-only supplier controller
import { db } from '../db/index.js';

export const createSupplier = async (req, res) => {
  try {
    const { name, contact, phone, email, address, branch } = req.body;
    const branchId = req.user.branch._id || req.user.branch.id; // Use user branch if not provided or admin override

    // Check duplicate
    const existing = db.prepare('SELECT * FROM suppliers WHERE name = ? AND branch = ?').get(name, branchId.toString());
    if (existing) {
      return res.status(400).json({ success: false, message: 'Supplier already exists' });
    }

    const result = db.prepare(`
        INSERT INTO suppliers (name, contact, phone, email, address, branch)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      name,
      contact || '',
      phone || '',
      email || '',
      address || '',
      branchId.toString()
    );

    const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({
      success: true,
      data: { ...supplier, _id: supplier.id.toString() },
      message: 'Supplier created successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const getSuppliers = async (req, res) => {
  try {
    const { page = 1, limit = 10, search } = req.query;
    const branchId = req.user.branch._id || req.user.branch.id;

    let query = 'SELECT * FROM suppliers WHERE branch = ?';
    const params = [branchId.toString()];

    if (search) {
      query += ' AND (name LIKE ? OR contact LIKE ? OR phone LIKE ? OR email LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }

    // Count
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
    const total = db.prepare(countQuery).get(...params).total || 0;

    // Sort and Paginate
    query += ' ORDER BY name ASC LIMIT ? OFFSET ?';
    const offset = (parseInt(page) - 1) * parseInt(limit);
    params.push(parseInt(limit), offset);

    const suppliers = db.prepare(query).all(...params);

    res.json({
      success: true,
      data: {
        suppliers: suppliers.map(s => ({ ...s, _id: s.id.toString() })),
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
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