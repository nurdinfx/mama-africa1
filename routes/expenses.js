// backend/routes/expenses.js
import express from 'express';
import { auth, authorize } from '../middleware/auth.js';
import {
  getExpenses,
  getExpense,
  createExpense,
  updateExpense,
  deleteExpense
} from '../controllers/expenseController.js';

const router = express.Router();

router.get('/', auth, authorize('admin', 'manager'), getExpenses);
router.get('/:id', auth, authorize('admin', 'manager'), getExpense);
router.post('/', auth, authorize('admin', 'manager'), createExpense);
router.put('/:id', auth, authorize('admin', 'manager'), updateExpense);
router.delete('/:id', auth, authorize('admin'), deleteExpense);

export default router;