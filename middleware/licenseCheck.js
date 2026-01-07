import db from '../services/sqlite.js';
import machineId from 'node-machine-id';

/**
 * Middleware to check if the current device has a valid license.
 */
export const licenseCheck = async (req, res, next) => {
    try {
        const currentDeviceId = await machineId.machineId();

        const license = db.prepare('SELECT * FROM licenses WHERE deviceId = ? AND status = ?').get(currentDeviceId, 'active');

        if (!license) {
            return res.status(402).json({
                success: false,
                message: 'No active license found for this device. Please activate HUDI-SOFT to continue.',
                deviceId: currentDeviceId
            });
        }

        const now = new Date();
        const expiry = new Date(license.expiryDate);

        if (now > expiry) {
            return res.status(402).json({
                success: false,
                message: 'Your HUDI-SOFT license has expired. Please renew your subscription.',
                expiryDate: license.expiryDate
            });
        }

        next();
    } catch (error) {
        console.error('License check error:', error);
        // Grace period or allow if dev mode
        if (process.env.NODE_ENV === 'development') {
            return next();
        }
        res.status(500).json({ success: false, message: 'Internal licensing error' });
    }
};
