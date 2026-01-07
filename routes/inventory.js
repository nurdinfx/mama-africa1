import express from 'express';
import {
  getInventory,
  getLowStockItems,
  getInventoryItem,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  restockInventory
} from '../controllers/inventoryController.js';
import { auth, authorize } from '../middleware/auth.js';

const router = express.Router();

// Get all inventory items
router.get('/', auth, getInventory);

// Get low stock items
router.get('/alerts/low-stock', auth, getLowStockItems);

// Get inventory item by ID
router.get('/:id', auth, getInventoryItem);

// Create inventory item
router.post('/', auth, authorize('admin', 'manager'), createInventoryItem);

// Update inventory item
router.put('/:id', auth, authorize('admin', 'manager'), updateInventoryItem);

// Delete inventory item
router.delete('/:id', auth, authorize('admin', 'manager'), deleteInventoryItem);

// Restock inventory
router.post('/:id/restock', auth, authorize('admin', 'manager'), restockInventory);

export default router;