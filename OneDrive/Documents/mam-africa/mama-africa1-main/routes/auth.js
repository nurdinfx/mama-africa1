import express from 'express';
import auth from '../middleware/auth.js';
import {
  login,
  register,
  getMe,
  logout,
  getDemoAccounts,
  checkEmail
} from '../controllers/authController.js';

const router = express.Router();

// Public routes
router.post('/login', login);
router.post('/register', register);
router.get('/demo-accounts', getDemoAccounts);
router.get('/check-email', checkEmail);

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Auth service is running',
    timestamp: new Date().toISOString()
  });
});

// Protected routes
router.get('/me', auth, getMe);
router.post('/logout', auth, logout);

export default router;