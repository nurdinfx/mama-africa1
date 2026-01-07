// SQLite-only menu controller
import { db } from '../db/index.js';

// Get all menu items (using products table)
export const getMenuItems = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 50,
            search = '',
            category = '',
            available
        } = req.query;

        const branchId = req.user.branch._id || req.user.branch.id;

        let query = 'SELECT * FROM products WHERE branch = ?';
        const params = [branchId.toString()];

        if (search) {
            query += ' AND (name LIKE ? OR description LIKE ?)';
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm);
        }

        if (category) {
            query += ' AND category = ?';
            params.push(category);
        }

        if (available !== undefined) {
            // isAvailable is stored as 1 or 0
            query += ' AND isAvailable = ?';
            params.push(available === 'true' ? 1 : 0);
        }

        // Get total count
        const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
        const totalResult = db.prepare(countQuery).get(...params);
        const total = totalResult.total || 0;

        // Apply sorting and pagination
        query += ' ORDER BY category ASC, name ASC LIMIT ? OFFSET ?';
        const offset = (parseInt(page) - 1) * parseInt(limit);
        params.push(parseInt(limit), offset);

        const items = db.prepare(query).all(...params);

        res.json({
            success: true,
            data: {
                menuItems: items.map(item => ({
                    ...item,
                    _id: item.id.toString(),
                    price: item.price,
                    isAvailable: item.isAvailable === 1,
                    //ingredients: [] // Ingredients not supported in simple SQLite schema yet
                })),
                totalPages: Math.ceil(total / limit),
                currentPage: parseInt(page),
                total
            }
        });
    } catch (error) {
        console.error('Get menu items error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching menu items'
        });
    }
};

// Get menu item by ID
export const getMenuItem = async (req, res) => {
    try {
        const { id } = req.params;
        const branchId = req.user.branch._id || req.user.branch.id;

        const item = db.prepare('SELECT * FROM products WHERE id = ? AND branch = ?').get(id, branchId.toString());

        if (!item) {
            return res.status(404).json({
                success: false,
                message: 'Menu item not found'
            });
        }

        res.json({
            success: true,
            data: {
                menuItem: {
                    ...item,
                    _id: item.id.toString(),
                    isAvailable: item.isAvailable === 1
                }
            }
        });
    } catch (error) {
        console.error('Get menu item error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching menu item'
        });
    }
};

// Create menu item (Delegates to createProduct logic essentially, but tailored for Menu route)
export const createMenuItem = async (req, res) => {
    try {
        const { name, description, price, category, isAvailable, image } = req.body;
        const branchId = req.user.branch._id || req.user.branch.id;

        const result = db.prepare(`
        INSERT INTO products (name, description, price, category, isAvailable, image, branch, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
            name,
            description || '',
            price,
            category,
            isAvailable !== false ? 1 : 0,
            image || '',
            branchId.toString()
        );

        const item = db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid);

        res.status(201).json({
            success: true,
            message: 'Menu item created successfully',
            data: { menuItem: { ...item, _id: item.id.toString() } }
        });
    } catch (error) {
        console.error('Create menu item error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error creating menu item'
        });
    }
};

// Update menu item
export const updateMenuItem = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, price, category, isAvailable, image } = req.body;
        const branchId = req.user.branch._id || req.user.branch.id;

        const existing = db.prepare('SELECT * FROM products WHERE id = ? AND branch = ?').get(id, branchId.toString());
        if (!existing) {
            return res.status(404).json({ success: false, message: 'Menu item not found' });
        }

        const updates = [];
        const params = [];

        if (name) { updates.push('name = ?'); params.push(name); }
        if (description !== undefined) { updates.push('description = ?'); params.push(description); }
        if (price !== undefined) { updates.push('price = ?'); params.push(price); }
        if (category) { updates.push('category = ?'); params.push(category); }
        if (isAvailable !== undefined) { updates.push('isAvailable = ?'); params.push(isAvailable ? 1 : 0); }
        if (image !== undefined) { updates.push('image = ?'); params.push(image); }

        updates.push('updated_at = CURRENT_TIMESTAMP');
        params.push(id, branchId.toString());

        db.prepare(`UPDATE products SET ${updates.join(', ')} WHERE id = ? AND branch = ?`).run(...params);

        const item = db.prepare('SELECT * FROM products WHERE id = ?').get(id);

        res.json({
            success: true,
            message: 'Menu item updated successfully',
            data: { menuItem: { ...item, _id: item.id.toString(), isAvailable: item.isAvailable === 1 } }
        });
    } catch (error) {
        console.error('Update menu item error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error updating menu item'
        });
    }
};

// Delete menu item
export const deleteMenuItem = async (req, res) => {
    try {
        const { id } = req.params;
        const branchId = req.user.branch._id || req.user.branch.id;

        const result = db.prepare('DELETE FROM products WHERE id = ? AND branch = ?').run(id, branchId.toString());

        if (result.changes === 0) {
            return res.status(404).json({ success: false, message: 'Menu item not found' });
        }

        res.json({ success: true, message: 'Menu item deleted successfully' });
    } catch (error) {
        console.error('Delete menu item error:', error);
        res.status(500).json({ success: false, message: 'Server error deleting menu item' });
    }
};

// Deduct stock (Legacy support, though orderController handles this now)
export const deductStock = async (req, res) => {
    try {
        // In SQLite model, we deduct from product directly.
        // If frontend calls this manually, we basically do what orderController does.
        const { id } = req.params;
        const { quantity = 1 } = req.body;
        const branchId = req.user.branch._id || req.user.branch.id;

        db.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND branch = ?')
            .run(quantity, id, branchId.toString());

        res.json({ success: true, message: 'Stock deducted successfully' });

    } catch (error) {
        console.error('Deduct stock error:', error);
        res.status(500).json({ success: false, message: 'Server error deducting stock' });
    }
};
