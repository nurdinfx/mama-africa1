// backend/routes/users.js
import express from 'express';
import { auth, authorize } from '../middleware/auth.js';
import {
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  toggleUserStatus
} from '../controllers/userController.js';

const router = express.Router();

router.get('/', auth, authorize('admin', 'manager'), getUsers);
router.get('/:id', auth, authorize('admin', 'manager'), getUser);
router.post('/', auth, authorize('admin', 'manager'), createUser);
router.put('/:id', auth, authorize('admin', 'manager'), updateUser);
router.delete('/:id', auth, authorize('admin'), deleteUser);
router.patch('/:id/status', auth, authorize('admin', 'manager'), toggleUserStatus);

export default router;