// backend/routes/tables.js
import express from 'express';
import { auth, authorize } from '../middleware/auth.js';
import {
  getTables,
  getTable,
  createTable,
  updateTable,
  deleteTable,
  updateTableStatus,
  getAvailableTables
} from '../controllers/tableController.js';

const router = express.Router();

router.get('/', auth, authorize('admin', 'manager', 'cashier'), getTables);
router.get('/available', auth, authorize('admin', 'manager', 'cashier'), getAvailableTables);
router.get('/:id', auth, authorize('admin', 'manager', 'cashier'), getTable);
router.post('/', auth, authorize('admin', 'manager'), createTable);
router.put('/:id', auth, authorize('admin', 'manager'), updateTable);
router.patch('/:id/status', auth, authorize('admin', 'manager', 'cashier'), updateTableStatus);
router.delete('/:id', auth, authorize('admin'), deleteTable);

export default router;