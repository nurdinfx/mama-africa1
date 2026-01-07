// SQLite-only database exports
import { db as sqliteDb, initSQLite } from './sqlite.js';
import { ensureSqliteTables } from './tables.js';

// Initialize SQLite database and tables
export const initDatabase = async () => {
  ensureSqliteTables();
  console.log('✅ SQLite database initialized');
};

export { sqliteDb as db, initSQLite };
export const databaseEngine = 'sqlite'; // Always SQLite now
