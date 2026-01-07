// SQLite-only inventory controller
import { db } from '../db/index.js';

// Get all inventory items
export const getInventory = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 50,
            search = '',
            category = '',
            lowStock = false
        } = req.query;

        const branchId = req.user.branch._id || req.user.branch.id;

        let query = 'SELECT * FROM products WHERE branch = ?';
        const params = [branchId.toString()];

        if (search) {
            query += ' AND name LIKE ?';
            const searchTerm = `%${search}%`;
            params.push(searchTerm);
        }

        if (category) {
            query += ' AND category = ?';
            params.push(category);
        }

        if (lowStock === 'true') {
            query += ' AND stock <= minStock';
        }

        // Get total count
        const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
        const totalResult = db.prepare(countQuery).get(...params);
        const total = totalResult.total || 0;

        // Apply sorting and pagination
        query += ' ORDER BY name ASC LIMIT ? OFFSET ?';
        const offset = (parseInt(page) - 1) * parseInt(limit);
        params.push(parseInt(limit), offset);

        const inventory = db.prepare(query).all(...params);

        res.json({
            success: true,
            data: {
                inventory: inventory.map(item => ({
                    ...item,
                    _id: item.id.toString(),
                    currentStock: item.stock, // Map for frontend compatibility
                    isLowStock: item.stock <= item.minStock
                })),
                totalPages: Math.ceil(total / limit),
                currentPage: parseInt(page),
                total
            }
        });
    } catch (error) {
        console.error('Get inventory error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching inventory'
        });
    }
};

// Get low stock items
export const getLowStockItems = async (req, res) => {
    try {
        const branchId = req.user.branch._id || req.user.branch.id;

        const lowStockItems = db.prepare(`
        SELECT * FROM products 
        WHERE branch = ? AND stock <= minStock
        ORDER BY stock ASC
    `).all(branchId.toString());

        res.json({
            success: true,
            data: {
                lowStockItems: lowStockItems.map(item => ({
                    ...item,
                    _id: item.id.toString(),
                    currentStock: item.stock,
                    isLowStock: true
                }))
            }
        });
    } catch (error) {
        console.error('Get low stock error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching low stock items'
        });
    }
};

// Get inventory item by ID
export const getInventoryItem = async (req, res) => {
    try {
        const { id } = req.params;
        const branchId = req.user.branch._id || req.user.branch.id;

        const item = db.prepare('SELECT * FROM products WHERE id = ? AND branch = ?').get(id, branchId.toString());

        if (!item) {
            return res.status(404).json({
                success: false,
                message: 'Inventory item not found'
            });
        }

        res.json({
            success: true,
            data: {
                inventoryItem: {
                    ...item,
                    _id: item.id.toString(),
                    currentStock: item.stock,
                    isLowStock: item.stock <= item.minStock
                }
            }
        });
    } catch (error) {
        console.error('Get inventory item error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching inventory item'
        });
    }
};

// Create inventory item (Maps to creating a product now as they are unified in SQLite schema)
export const createInventoryItem = async (req, res) => {
    try {
        const { name, category, currentStock, minStock, costPerUnit } = req.body;
        const branchId = req.user.branch._id || req.user.branch.id;

        const result = db.prepare(`
        INSERT INTO products (name, category, stock, minStock, cost, branch, active, isAvailable)
        VALUES (?, ?, ?, ?, ?, ?, 1, 1)
    `).run(
            name,
            category,
            currentStock || 0,
            minStock || 10,
            costPerUnit || 0,
            branchId.toString()
        );

        const item = db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid);

        res.status(201).json({
            success: true,
            message: 'Inventory item created successfully',
            data: {
                inventoryItem: {
                    ...item,
                    _id: item.id.toString(),
                    currentStock: item.stock
                }
            }
        });
    } catch (error) {
        console.error('Create inventory error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error creating inventory item'
        });
    }
};

// Update inventory item
export const updateInventoryItem = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, category, currentStock, minStock, costPerUnit } = req.body;
        const branchId = req.user.branch._id || req.user.branch.id;

        const existing = db.prepare('SELECT * FROM products WHERE id = ? AND branch = ?').get(id, branchId.toString());
        if (!existing) {
            return res.status(404).json({
                success: false,
                message: 'Inventory item not found'
            });
        }

        const updates = [];
        const params = [];

        if (name) { updates.push('name = ?'); params.push(name); }
        if (category) { updates.push('category = ?'); params.push(category); }
        if (currentStock !== undefined) { updates.push('stock = ?'); params.push(currentStock); }
        if (minStock !== undefined) { updates.push('minStock = ?'); params.push(minStock); }
        if (costPerUnit !== undefined) { updates.push('cost = ?'); params.push(costPerUnit); }

        updates.push('updated_at = CURRENT_TIMESTAMP');
        params.push(id, branchId.toString());

        db.prepare(`UPDATE products SET ${updates.join(', ')} WHERE id = ? AND branch = ?`).run(...params);

        const item = db.prepare('SELECT * FROM products WHERE id = ?').get(id);

        res.json({
            success: true,
            message: 'Inventory item updated successfully',
            data: {
                inventoryItem: {
                    ...item,
                    _id: item.id.toString(),
                    currentStock: item.stock
                }
            }
        });
    } catch (error) {
        console.error('Update inventory error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error updating inventory item'
        });
    }
};

// Delete inventory item
export const deleteInventoryItem = async (req, res) => {
    try {
        const { id } = req.params;
        const branchId = req.user.branch._id || req.user.branch.id;

        const result = db.prepare('DELETE FROM products WHERE id = ? AND branch = ?').run(id, branchId.toString());

        if (result.changes === 0) {
            return res.status(404).json({
                success: false,
                message: 'Inventory item not found'
            });
        }

        res.json({
            success: true,
            message: 'Inventory item deleted successfully'
        });
    } catch (error) {
        console.error('Delete inventory error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error deleting inventory item'
        });
    }
};

// Restock inventory
export const restockInventory = async (req, res) => {
    try {
        const { id } = req.params;
        const { quantity, cost } = req.body;
        const branchId = req.user.branch._id || req.user.branch.id;

        const item = db.prepare('SELECT * FROM products WHERE id = ? AND branch = ?').get(id, branchId.toString());

        if (!item) {
            return res.status(404).json({
                success: false,
                message: 'Inventory item not found'
            });
        }

        const updates = ['stock = stock + ?', 'updated_at = CURRENT_TIMESTAMP'];
        const params = [parseInt(quantity), id, branchId.toString()];

        if (cost) {
            updates.push('cost = ?');
            // Insert cost before id in params, but after quantity
            params.splice(1, 0, parseFloat(cost));
        }

        db.prepare(`UPDATE products SET ${updates.join(', ')} WHERE id = ? AND branch = ?`).run(...params);

        // Log movement in inventory table
        db.prepare(`
        INSERT INTO inventory (product, type, quantity, reason, branch, createdBy)
        VALUES (?, 'in', ?, 'Restock', ?, ?)
    `).run(id, quantity, branchId.toString(), req.user.id.toString());

        const updatedItem = db.prepare('SELECT * FROM products WHERE id = ?').get(id);

        res.json({
            success: true,
            message: 'Inventory restocked successfully',
            data: {
                inventoryItem: {
                    ...updatedItem,
                    _id: updatedItem.id.toString(),
                    currentStock: updatedItem.stock
                }
            }
        });
    } catch (error) {
        console.error('Restock inventory error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error restocking inventory'
        });
    }
};
