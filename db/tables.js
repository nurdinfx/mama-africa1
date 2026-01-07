import { initSQLite } from './sqlite.js';

// Initialize all required SQLite tables.
// The actual schema lives in services/sqlite.js, which already creates:
// users, products, categories, orders, order_items, customers, branches, etc.
export const ensureSqliteTables = () => {
  initSQLite();
};


