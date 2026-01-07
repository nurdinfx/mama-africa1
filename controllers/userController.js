// SQLite-only user controller
import { db } from '../db/index.js';
import bcrypt from 'bcryptjs';

// Get all users
export const getUsers = async (req, res) => {
  try {
    const branchId = req.user.branch._id || req.user.branch.id;

    // Join with branches table to get branch details if needed, though they are in the same branch usually
    // Using branch table ID lookup
    const users = db.prepare(`
        SELECT u.*, b.name as branchName, b.branchCode 
        FROM users u 
        LEFT JOIN branches b ON u.branch = b.id
        WHERE u.branch = ?
        ORDER BY u.name ASC
    `).all(branchId.toString());

    res.json({
      success: true,
      data: users.map(u => ({
        ...u,
        _id: u.id.toString(),
        id: u.id.toString(),
        isActive: u.isActive === 1,
        branch: { _id: u.branch, id: u.branch, name: u.branchName, branchCode: u.branchCode }
      }))
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users'
    });
  }
};

// Get single user
export const getUser = async (req, res) => {
  try {
    const { id } = req.params;
    const branchId = req.user.branch._id || req.user.branch.id;

    const user = db.prepare(`
        SELECT u.*, b.name as branchName, b.branchCode 
        FROM users u 
        LEFT JOIN branches b ON u.branch = b.id
        WHERE u.id = ? AND u.branch = ?
    `).get(id, branchId.toString());

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: {
        ...user,
        _id: user.id.toString(),
        id: user.id.toString(),
        isActive: user.isActive === 1,
        branch: { _id: user.branch, id: user.branch, name: user.branchName, branchCode: user.branchCode }
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user'
    });
  }
};

// Create user
export const createUser = async (req, res) => {
  try {
    const { name, email, username, password, role } = req.body;
    const branchId = req.user.branch._id || req.user.branch.id;

    // Check existing
    const existing = db.prepare('SELECT * FROM users WHERE (email = ? OR username = ?) AND branch = ?')
      .get(email, username, branchId.toString());

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'User with this email or username already exists'
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const result = db.prepare(`
        INSERT INTO users (name, email, username, password, role, branch, isActive)
        VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(
      name,
      email,
      username,
      hashedPassword,
      role || 'staff',
      branchId.toString()
    );

    const user = db.prepare(`
        SELECT u.*, b.name as branchName, b.branchCode 
        FROM users u 
        LEFT JOIN branches b ON u.branch = b.id
        WHERE u.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json({
      success: true,
      data: {
        ...user,
        _id: user.id.toString(),
        id: user.id.toString(),
        branch: { _id: user.branch, name: user.branchName, branchCode: user.branchCode }
      },
      message: 'User created successfully'
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create user'
    });
  }
};

// Update user
export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const branchId = req.user.branch._id || req.user.branch.id;

    // Don't update password through this endpoint usually, IF provided hash it
    // But original controller said "Don't update password through this endpoint"
    // So we skip password.

    const updates = [];
    const params = [];

    if (updateData.name) { updates.push('name = ?'); params.push(updateData.name); }
    if (updateData.email) { updates.push('email = ?'); params.push(updateData.email); }
    if (updateData.username) { updates.push('username = ?'); params.push(updateData.username); }
    if (updateData.role) { updates.push('role = ?'); params.push(updateData.role); }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id, branchId.toString());

    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ? AND branch = ?`).run(...params);

    const user = db.prepare(`
        SELECT u.*, b.name as branchName, b.branchCode 
        FROM users u 
        LEFT JOIN branches b ON u.branch = b.id
        WHERE u.id = ?
    `).get(id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      data: {
        ...user,
        _id: user.id.toString(),
        isActive: user.isActive === 1,
        branch: { _id: user.branch, name: user.branchName, branchCode: user.branchCode }
      },
      message: 'User updated successfully'
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user'
    });
  }
};

// Delete user
export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const branchId = req.user.branch._id || req.user.branch.id;

    const result = db.prepare('DELETE FROM users WHERE id = ? AND branch = ?').run(id, branchId.toString());

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user'
    });
  }
};

// Toggle user status
export const toggleUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const branchId = req.user.branch._id || req.user.branch.id;

    const user = db.prepare('SELECT isActive FROM users WHERE id = ? AND branch = ?').get(id, branchId.toString());

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const newStatus = user.isActive === 1 ? 0 : 1;
    db.prepare('UPDATE users SET isActive = ? WHERE id = ?').run(newStatus, id);

    const updatedUser = db.prepare(`
        SELECT u.*, b.name as branchName, b.branchCode 
        FROM users u 
        LEFT JOIN branches b ON u.branch = b.id
        WHERE u.id = ?
    `).get(id);

    res.json({
      success: true,
      data: {
        ...updatedUser,
        _id: updatedUser.id.toString(),
        isActive: updatedUser.isActive === 1,
        branch: { _id: updatedUser.branch, name: updatedUser.branchName, branchCode: updatedUser.branchCode }
      },
      message: `User ${newStatus === 1 ? 'activated' : 'deactivated'} successfully`
    });
  } catch (error) {
    console.error('Toggle user status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle user status'
    });
  }
};
