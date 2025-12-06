// backend/routes/customers.js
import express from 'express';
import { auth, authorize } from '../middleware/auth.js';
import {
  getCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  searchCustomers,
  getCustomerLedger,
  addLedgerTransaction,
  getCustomerSummary
} from '../controllers/customerController.js';

const router = express.Router();

router.get('/', auth, authorize('admin', 'manager', 'cashier'), getCustomers);
router.get('/search', auth, authorize('admin', 'manager', 'cashier'), searchCustomers);
router.get('/:id', auth, authorize('admin', 'manager', 'cashier'), getCustomer);
router.get('/:id/ledger', auth, authorize('admin', 'manager', 'cashier'), getCustomerLedger);
router.get('/:id/summary', auth, authorize('admin', 'manager', 'cashier'), getCustomerSummary);
router.post('/', auth, authorize('admin', 'manager', 'cashier'), createCustomer);
router.post('/ledger/transaction', auth, authorize('admin', 'manager', 'cashier'), addLedgerTransaction);
router.put('/:id', auth, authorize('admin', 'manager'), updateCustomer);
router.delete('/:id', auth, authorize('admin'), deleteCustomer);

export default router;