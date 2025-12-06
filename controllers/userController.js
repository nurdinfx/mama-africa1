// backend/controllers/userController.js
import User from '../models/User.js';
import bcrypt from 'bcryptjs';

// Get all users
export const getUsers = async (req, res) => {
  try {
    const users = await User.find({ branch: req.user.branch._id })
      .select('-password')
      .populate('branch', 'name branchCode')
      .sort({ name: 1 });

    res.json({
      success: true,
      data: users
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
    const user = await User.findOne({
      _id: req.params.id,
      branch: req.user.branch._id
    }).select('-password').populate('branch', 'name branchCode');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user
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
    const userData = {
      ...req.body,
      branch: req.user.branch._id
    };

    const user = new User(userData);
    await user.save();

    const userResponse = await User.findById(user._id)
      .select('-password')
      .populate('branch', 'name branchCode');

    res.status(201).json({
      success: true,
      data: userResponse,
      message: 'User created successfully'
    });
  } catch (error) {
    console.error('Create user error:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Failed to create user'
    });
  }
};

// Update user
export const updateUser = async (req, res) => {
  try {
    const updateData = { ...req.body };
    
    // Don't update password through this endpoint
    delete updateData.password;

    const user = await User.findOneAndUpdate(
      { _id: req.params.id, branch: req.user.branch._id },
      updateData,
      { new: true, runValidators: true }
    ).select('-password').populate('branch', 'name branchCode');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user,
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
    const user = await User.findOneAndDelete({
      _id: req.params.id,
      branch: req.user.branch._id
    });

    if (!user) {
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
    const user = await User.findOne({
      _id: req.params.id,
      branch: req.user.branch._id
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.isActive = !user.isActive;
    await user.save();

    const userResponse = await User.findById(user._id)
      .select('-password')
      .populate('branch', 'name branchCode');

    res.json({
      success: true,
      data: userResponse,
      message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`
    });
  } catch (error) {
    console.error('Toggle user status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle user status'
    });
  }
};
