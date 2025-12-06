
// backend/routes/orders.js
import express from 'express';
import { auth, authorize } from '../middleware/auth.js';
import {
  createOrder,
  getOrders,
  getKitchenOrders,
  updateOrderStatus,
  processPayment,
  getOrderStats
} from '../controllers/orderController.js';

const router = express.Router();

router.post('/', auth, authorize('admin', 'manager', 'cashier', 'waiter'), createOrder);
router.get('/', auth, authorize('admin', 'manager', 'cashier', 'waiter'), getOrders);
router.get('/kitchen', auth, authorize('admin', 'manager', 'chef', 'kitchen'), getKitchenOrders);
router.get('/stats', auth, authorize('admin', 'manager'), getOrderStats);
router.put('/:id/status', auth, authorize('admin', 'chef', 'manager', 'kitchen'), updateOrderStatus);
router.post('/:id/payment', auth, authorize('admin', 'manager', 'cashier'), processPayment);

export default router;
