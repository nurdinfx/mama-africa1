import express from 'express';
import {
  getPurchaseReports,
  getInventoryReport
} from '../controllers/reportController.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

router.get('/purchases', auth, getPurchaseReports);
router.get('/inventory', auth, getInventoryReport);

export default router;