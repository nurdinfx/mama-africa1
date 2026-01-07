
let isOnline = false;

/**
 * Checks if the system is currently connected to MongoDB.
 * Always returns false for fully offline mode.
 * @returns {Promise<boolean>}
 */
export const checkConnectivity = async () => {
    return false;
};

/**
 * Returns the current connectivity status.
 * @returns {boolean}
 */
export const getConnectivityStatus = () => false;

/**
 * Starts a background loop to monitor connectivity.
 * @param {number} interval - Interval in milliseconds.
 */
export const startConnectivityMonitoring = (interval = 5000) => {
    // No monitoring needed for fully offline mode
    console.log('🌐 Connectivity monitoring: Local SQLite mode only');
};

export default {
    checkConnectivity,
    getConnectivityStatus,
    startConnectivityMonitoring
};
