import express from 'express';
import { auth, authorize } from '../middleware/auth.js';
import {
  getBranchSettings,
  updateBranchSettings,
  uploadLogo,
  getSystemSettings,
  getSettings,
  updateSettings
} from '../controllers/settingsController.js';

const router = express.Router();

// Branch-specific settings
router.get('/branch/:branchId', auth, getBranchSettings);
router.put('/branch/:branchId', auth, authorize('admin', 'manager'), updateBranchSettings);
router.post('/branch/:branchId/logo', auth, authorize('admin', 'manager'), uploadLogo);

// General settings (auto-detect branch based on user)
router.get('/', auth, getSettings);
router.put('/', auth, authorize('admin', 'manager'), updateSettings);

// System settings
router.get('/system', auth, authorize('admin'), getSystemSettings);

export default router;