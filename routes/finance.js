import express from 'express';
import {
  getDashboardData,
  getTransactions,
  createTransaction,
  generateReport
} from '../controllers/financeController.js';
import { auth, authorize } from '../middleware/auth.js';

const router = express.Router();

// Get financial dashboard data
router.get('/dashboard', auth, authorize('admin', 'manager'), getDashboardData);

// Get all transactions
router.get('/transactions', auth, authorize('admin', 'manager'), getTransactions);

// Create transaction
router.post('/transactions', auth, authorize('admin', 'manager'), createTransaction);

// Generate financial report
router.post('/reports/generate', auth, authorize('admin', 'manager'), generateReport);

export default router;
