import express from 'express';
import Inventory from '../models/Inventory.js';
import { auth, authorize } from '../middleware/auth.js';

const router = express.Router();

// Get all inventory items
router.get('/', auth, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      search = '', 
      category = '',
      lowStock = false
    } = req.query;
    
    const query = {};
    
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }
    
    if (category) {
      query.category = category;
    }
    
    if (lowStock === 'true') {
      query.isLowStock = true;
    }

    const inventory = await Inventory.find(query)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ isLowStock: -1, name: 1 });

    const total = await Inventory.countDocuments(query);

    res.json({
      success: true,
      data: {
        inventory,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
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
});

// Get low stock items
router.get('/alerts/low-stock', auth, async (req, res) => {
  try {
    const lowStockItems = await Inventory.find({ isLowStock: true })
      .sort({ currentStock: 1 });

    res.json({
      success: true,
      data: { lowStockItems }
    });
  } catch (error) {
    console.error('Get low stock error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching low stock items'
    });
  }
});

// Get inventory item by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const inventoryItem = await Inventory.findById(req.params.id);

    if (!inventoryItem) {
      return res.status(404).json({
        success: false,
        message: 'Inventory item not found'
      });
    }

    res.json({
      success: true,
      data: { inventoryItem }
    });
  } catch (error) {
    console.error('Get inventory item error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching inventory item'
    });
  }
});

// Create inventory item
router.post('/', auth, authorize('admin', 'manager'), async (req, res) => {
  try {
    const inventoryItem = new Inventory(req.body);
    await inventoryItem.save();

    res.status(201).json({
      success: true,
      message: 'Inventory item created successfully',
      data: { inventoryItem }
    });
  } catch (error) {
    console.error('Create inventory error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating inventory item'
    });
  }
});

// Update inventory item
router.put('/:id', auth, authorize('admin', 'manager'), async (req, res) => {
  try {
    const inventoryItem = await Inventory.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!inventoryItem) {
      return res.status(404).json({
        success: false,
        message: 'Inventory item not found'
      });
    }

    res.json({
      success: true,
      message: 'Inventory item updated successfully',
      data: { inventoryItem }
    });
  } catch (error) {
    console.error('Update inventory error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating inventory item'
    });
  }
});

// Delete inventory item
router.delete('/:id', auth, authorize('admin', 'manager'), async (req, res) => {
  try {
    const inventoryItem = await Inventory.findByIdAndDelete(req.params.id);

    if (!inventoryItem) {
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
});

// Restock inventory
router.post('/:id/restock', auth, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { quantity, cost } = req.body;
    
    const inventoryItem = await Inventory.findById(req.params.id);

    if (!inventoryItem) {
      return res.status(404).json({
        success: false,
        message: 'Inventory item not found'
      });
    }

    inventoryItem.currentStock += quantity;
    if (cost) {
      inventoryItem.costPerUnit = cost;
    }
    inventoryItem.lastRestocked = new Date();

    await inventoryItem.save();

    res.json({
      success: true,
      message: 'Inventory restocked successfully',
      data: { inventoryItem }
    });
  } catch (error) {
    console.error('Restock inventory error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error restocking inventory'
    });
  }
});

export default router;