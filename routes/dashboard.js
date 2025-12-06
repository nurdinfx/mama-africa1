// backend/routes/dashboard.js
import express from 'express';
import { auth, authorize } from '../middleware/auth.js';
import {
  getStats,
  getRevenueData,
  getTopProducts,
  getRecentActivity
} from '../controllers/dashboardController.js';

const router = express.Router();

router.get('/stats', auth, authorize('admin', 'manager', 'cashier'), getStats);
router.get('/revenue', auth, authorize('admin', 'manager'), getRevenueData);
router.get('/top-products', auth, authorize('admin', 'manager'), getTopProducts);
router.get('/recent-activity', auth, authorize('admin', 'manager'), getRecentActivity);

export default router;