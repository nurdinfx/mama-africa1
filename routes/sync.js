import express from 'express';
import { auth } from '../middleware/auth.js';

const router = express.Router();

// POST /sync
// Body: { operations: [ { method: 'POST'|'PUT'|'DELETE', url: '/products'|'/products/:id'|'/purchases'|..., body: {...} } ] }
router.post('/', auth, async (req, res) => {
  // Sync functionality is currently disabled for persistent offline mode.
  // In a fully offline setup, multiple devices usually sync via P2P or central local server.
  // This endpoint previously used MongoDB.

  // For now, return success to prevent frontend errors if it attempts to sync.
  res.json({
    success: true,
    results: [],
    message: "Sync not active in standalone offline mode."
  });
});

export default router;
