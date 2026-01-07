import express from 'express';
import {
  getMenuItems,
  getMenuItem,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  deductStock
} from '../controllers/menuController.js';
import { auth, authorize } from '../middleware/auth.js';
import { validateMenuItem } from '../middleware/validation.js';

const router = express.Router();

// Get all menu items
router.get('/', getMenuItems);

// Get menu item by ID
router.get('/:id', getMenuItem);

// Create menu item (Admin/Manager only)
router.post('/', auth, authorize('admin', 'manager'), validateMenuItem, createMenuItem);

// Update menu item
router.put('/:id', auth, authorize('admin', 'manager'), updateMenuItem);

// Delete menu item
router.delete('/:id', auth, authorize('admin', 'manager'), deleteMenuItem);

// Update ingredient stock when menu item is ordered (Legacy support)
router.post('/:id/deduct-stock', auth, deductStock);

export default router;