import express from 'express';
import db from '../services/sqlite.js';
import machineId from 'node-machine-id';

const router = express.Router();

/**
 * Get device ID for activation.
 */
router.get('/device-id', async (req, res) => {
    try {
        const id = await machineId.machineId();
        res.json({ success: true, deviceId: id });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to get device ID' });
    }
});

/**
 * Activate license.
 */
router.post('/activate', async (req, res) => {
    const { licenseKey } = req.body;

    if (!licenseKey) {
        return res.status(400).json({ success: false, message: 'License key is required' });
    }

    try {
        const currentDeviceId = await machineId.machineId();

        // In a real commercial app, this would verify against a central server.
        // For now, we'll implement a basic validation and store locally.
        // Assuming 5-year duration as per requirements.
        const startDate = new Date();
        const expiryDate = new Date();
        expiryDate.setFullYear(startDate.getFullYear() + 5);

        db.prepare(`
      INSERT INTO licenses (licenseKey, deviceId, startDate, expiryDate, status, lastCheck)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(deviceId) DO UPDATE SET
        licenseKey=excluded.licenseKey, status='active'
    `).run(licenseKey, currentDeviceId, startDate.toISOString(), expiryDate.toISOString(), 'active', startDate.toISOString());

        res.json({
            success: true,
            message: 'HUDI-SOFT Activated successfully! License valid for 5 years.',
            expiryDate: expiryDate.toISOString()
        });
    } catch (error) {
        console.error('Activation error:', error);
        res.status(500).json({ success: false, message: 'Activation failed' });
    }
});

/**
 * Check license status.
 */
router.get('/status', async (req, res) => {
    try {
        const currentDeviceId = await machineId.machineId();
        const license = db.prepare('SELECT * FROM licenses WHERE deviceId = ?').get(currentDeviceId);

        if (!license) {
            return res.json({ success: false, message: 'Not activated', deviceId: currentDeviceId });
        }

        res.json({ success: true, license });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to check status' });
    }
});

export default router;
