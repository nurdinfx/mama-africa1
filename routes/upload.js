import express from 'express';
import { auth, authorize } from '../middleware/auth.js';
import { uploadImage } from '../controllers/uploadController.js';

const router = express.Router();

router.post('/image', auth, authorize('admin', 'manager'), uploadImage);

export default router;