import { connectMongo } from './mongo.js';
import { ensureSqliteTables } from './tables.js';

// Global database engine flag: "mongo" | "sqlite"
export let databaseEngine = 'sqlite';

export const setDatabaseEngine = (engine) => {
  databaseEngine = engine;
};

/**
 * Initialize databases and decide which engine to use.
 * - Always initializes SQLite (for offline / local persistence).
 * - Tries to connect to MongoDB with a short timeout (3s). On success, uses "mongo".
 * - On failure, falls back to "sqlite" only.
 */
export const initDatabaseEngine = async () => {
  // Always make sure SQLite schema exists
  ensureSqliteTables();

  try {
    const mongoConn = await connectMongo();
    if (mongoConn) {
      setDatabaseEngine('mongo');
    } else {
      setDatabaseEngine('sqlite');
    }
  } catch (e) {
    console.error('❌ [DB] Error while initializing MongoDB, using SQLite only:', e.message);
    setDatabaseEngine('sqlite');
  }

  console.log('🗄️  Database Mode:', databaseEngine.toUpperCase());
};


