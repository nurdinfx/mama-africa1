import express from 'express';
import MenuItem from '../models/MenuItem.js';
import Inventory from '../models/Inventory.js';
import { auth, authorize } from '../middleware/auth.js';
import { validateMenuItem } from '../middleware/validation.js';

const router = express.Router();

// Get all menu items
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      search = '', 
      category = '',
      available 
    } = req.query;
    
    const query = {};
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (category) {
      query.category = category;
    }
    
    if (available !== undefined) {
      query.isAvailable = available === 'true';
    }

    const menuItems = await MenuItem.find(query)
      .populate('ingredients.inventoryItem')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ category: 1, name: 1 });

    const total = await MenuItem.countDocuments(query);

    res.json({
      success: true,
      data: {
        menuItems,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
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
});

// Get menu item by ID
router.get('/:id', async (req, res) => {
  try {
    const menuItem = await MenuItem.findById(req.params.id)
      .populate('ingredients.inventoryItem');

    if (!menuItem) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found'
      });
    }

    res.json({
      success: true,
      data: { menuItem }
    });
  } catch (error) {
    console.error('Get menu item error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching menu item'
    });
  }
});

// Create menu item (Admin/Manager only)
router.post('/', auth, authorize('admin', 'manager'), validateMenuItem, async (req, res) => {
  try {
    const menuItem = new MenuItem(req.body);
    await menuItem.save();

    const populatedItem = await MenuItem.findById(menuItem._id)
      .populate('ingredients.inventoryItem');

    res.status(201).json({
      success: true,
      message: 'Menu item created successfully',
      data: { menuItem: populatedItem }
    });
  } catch (error) {
    console.error('Create menu item error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating menu item'
    });
  }
});

// Update menu item
router.put('/:id', auth, authorize('admin', 'manager'), async (req, res) => {
  try {
    const menuItem = await MenuItem.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('ingredients.inventoryItem');

    if (!menuItem) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found'
      });
    }

    res.json({
      success: true,
      message: 'Menu item updated successfully',
      data: { menuItem }
    });
  } catch (error) {
    console.error('Update menu item error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating menu item'
    });
  }
});

// Delete menu item
router.delete('/:id', auth, authorize('admin', 'manager'), async (req, res) => {
  try {
    const menuItem = await MenuItem.findByIdAndDelete(req.params.id);

    if (!menuItem) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found'
      });
    }

    res.json({
      success: true,
      message: 'Menu item deleted successfully'
    });
  } catch (error) {
    console.error('Delete menu item error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting menu item'
    });
  }
});

// Update ingredient stock when menu item is ordered
router.post('/:id/deduct-stock', auth, async (req, res) => {
  try {
    const { quantity = 1 } = req.body;
    const menuItem = await MenuItem.findById(req.params.id)
      .populate('ingredients.inventoryItem');

    if (!menuItem) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found'
      });
    }

    // Deduct ingredients from inventory
    for (const ingredient of menuItem.ingredients) {
      if (ingredient.inventoryItem) {
        const inventoryItem = await Inventory.findById(ingredient.inventoryItem._id);
        if (inventoryItem) {
          inventoryItem.currentStock -= ingredient.quantity * quantity;
          await inventoryItem.save();
        }
      }
    }

    res.json({
      success: true,
      message: 'Stock deducted successfully'
    });
  } catch (error) {
    console.error('Deduct stock error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deducting stock'
    });
  }
});

export default router;