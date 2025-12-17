// backend/routes/products.js
import express from 'express';
import { auth, authorize } from '../middleware/auth.js';
import {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  updateStock,
  getCategories,
  getLowStockProducts
} from '../controllers/productController.js';

const router = express.Router();

// All routes are protected and require authentication
router.get('/', auth, authorize('admin', 'manager', 'cashier', 'chef', 'waiter'), getProducts);
router.get('/categories', auth, authorize('admin', 'manager', 'cashier', 'waiter'), getCategories);
router.get('/low-stock', auth, authorize('admin', 'manager'), getLowStockProducts);
router.get('/:id', auth, authorize('admin', 'manager', 'cashier', 'waiter'), getProduct);
router.post('/', auth, authorize('admin', 'manager'), createProduct);
router.put('/:id', auth, authorize('admin', 'manager'), updateProduct);
router.delete('/:id', auth, authorize('admin'), deleteProduct);
router.patch('/:id/stock', auth, authorize('admin', 'manager'), updateStock);

export default router;