import express from 'express';
import {
  createPurchaseOrder,
  getPurchaseOrders,
  approvePurchaseOrder
} from '../controllers/purchaseOrderController.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

router.post('/', auth, createPurchaseOrder);
router.get('/', auth, getPurchaseOrders);
router.put('/:id/approve', auth, approvePurchaseOrder);

export default router;