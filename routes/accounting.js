import express from 'express';
import {
  getBalanceSheet,
  getIncomeStatement,
  exportFinancialData
} from '../controllers/accountingController.js';
import { auth, authorize } from '../middleware/auth.js';

const router = express.Router();

// Get balance sheet
router.get('/balance-sheet', auth, authorize('admin'), getBalanceSheet);

// Get income statement
router.get('/income-statement', auth, authorize('admin', 'manager'), getIncomeStatement);

// Export financial data
router.get('/export', auth, authorize('admin'), exportFinancialData);

export default router;
