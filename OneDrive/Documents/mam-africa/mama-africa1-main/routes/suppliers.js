import express from 'express';
import {
  createSupplier,
  getSuppliers
} from '../controllers/supplierController.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

router.post('/', auth, createSupplier);
router.get('/', auth, getSuppliers);

export default router;