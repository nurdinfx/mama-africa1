import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define DB path - using the same persistent storage path as uploads if available
const homeDir = process.env.HOME || process.env.USERPROFILE;
const baseStart = process.env.PERSISTENT_STORAGE_PATH || homeDir;
const storageBaseDir = process.env.PERSISTENT_STORAGE_PATH ? baseStart : path.join(baseStart, 'mama-africa-storage');
const dbPath = path.join(storageBaseDir, 'pos.db');

// Ensure directory exists
if (!fs.existsSync(storageBaseDir)) {
  fs.mkdirSync(storageBaseDir, { recursive: true });
}

console.log('📂 SQLite Database path:', dbPath);

const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

export const initSQLite = () => {
  // Users table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mongodb_id TEXT UNIQUE,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      username TEXT UNIQUE,
      password TEXT,
      role TEXT,
      branch TEXT,
      isActive INTEGER DEFAULT 1,
      synced INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // Products table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mongodb_id TEXT UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      price REAL,
      cost REAL,
      category TEXT,
      stock INTEGER DEFAULT 0,
      minStock INTEGER DEFAULT 10,
      isAvailable INTEGER DEFAULT 1,
      active INTEGER DEFAULT 1,
      image TEXT,
      sku TEXT,
      barcode TEXT,
      branch TEXT,
      synced INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // Orders table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mongodb_id TEXT UNIQUE,
      orderNumber TEXT UNIQUE,
      orderType TEXT,
      status TEXT DEFAULT 'pending',
      customer TEXT,
      tableId TEXT,
      tableNumber TEXT,
      customerName TEXT,
      customerPhone TEXT,
      subtotal REAL,
      tax REAL,
      discount REAL,
      serviceCharge REAL,
      finalTotal REAL,
      paymentMethod TEXT DEFAULT 'cash',
      paymentStatus TEXT DEFAULT 'pending',
      cashier TEXT,
      branch TEXT,
      kitchenStatus TEXT DEFAULT 'pending',
      kitchenNotes TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      synced INTEGER DEFAULT 0
    )
  `).run();

  // Order Items table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER,
      product_id TEXT, -- Can be local id or mongodb id
      product_name TEXT,
      quantity INTEGER,
      price REAL,
      total REAL,
      notes TEXT,
      FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
    )
  `).run();

  // Tables table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mongodb_id TEXT UNIQUE,
      number TEXT,
      tableNumber TEXT,
      name TEXT,
      capacity INTEGER,
      location TEXT,
      status TEXT DEFAULT 'available',
      branch TEXT,
      synced INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // Customers table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mongodb_id TEXT UNIQUE,
      name TEXT,
      phone TEXT,
      email TEXT,
      branch TEXT,
      synced INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // Categories table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mongodb_id TEXT UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      branch TEXT,
      synced INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // Licenses table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS licenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      licenseKey TEXT UNIQUE,
      deviceId TEXT UNIQUE,
      startDate DATETIME,
      expiryDate DATETIME,
      status TEXT,
      lastCheck DATETIME
    )
  `).run();

  // Sync Log table (optional but helpful for tracking)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS sync_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      last_sync_up DATETIME,
      last_sync_down DATETIME,
      status TEXT
    )
  `).run();

  // Branches table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS branches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mongodb_id TEXT UNIQUE,
      name TEXT NOT NULL,
      branchCode TEXT UNIQUE,
      address TEXT,
      phone TEXT,
      email TEXT,
      settings TEXT, -- JSON string
      isActive INTEGER DEFAULT 1,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // Expenses table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mongodb_id TEXT UNIQUE,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT,
      date DATETIME,
      branch TEXT,
      createdBy TEXT,
      synced INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // Suppliers table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mongodb_id TEXT UNIQUE,
      name TEXT NOT NULL,
      contact TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      branch TEXT,
      synced INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // Purchase Orders table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mongodb_id TEXT UNIQUE,
      orderNumber TEXT UNIQUE,
      supplierId TEXT,
      status TEXT DEFAULT 'pending',
      subtotal REAL,
      taxTotal REAL,
      discountTotal REAL,
      grandTotal REAL,
      branch TEXT,
      createdBy TEXT,
      approvedBy TEXT,
      expectedDelivery DATETIME,
      approvedAt DATETIME,
      notes TEXT,
      synced INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // Purchase Order Items
  db.prepare(`
    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_order_id INTEGER,
      productId TEXT,
      orderedQty INTEGER,
      receivedQty INTEGER DEFAULT 0,
      unitCost REAL,
      discount REAL,
      tax REAL,
      total REAL,
      FOREIGN KEY(purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE
    )
  `).run();

  // Purchases table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mongodb_id TEXT UNIQUE,
      purchaseNumber TEXT UNIQUE,
      supplierId TEXT,
      subtotal REAL,
      taxTotal REAL,
      discountTotal REAL,
      grandTotal REAL,
      paymentMethod TEXT DEFAULT 'cash',
      status TEXT DEFAULT 'submitted',
      branch TEXT,
      createdBy TEXT,
      notes TEXT,
      synced INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // Purchase Items
  db.prepare(`
    CREATE TABLE IF NOT EXISTS purchase_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER,
      productId TEXT,
      qty INTEGER,
      unitCost REAL,
      discount REAL,
      tax REAL,
      total REAL,
      FOREIGN KEY(purchase_id) REFERENCES purchases(id) ON DELETE CASCADE
    )
  `).run();

  // Inventory table (for tracking stock movements)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mongodb_id TEXT UNIQUE,
      product TEXT,
      type TEXT, -- 'in', 'out', 'adjustment'
      quantity INTEGER,
      reason TEXT,
      branch TEXT,
      createdBy TEXT,
      synced INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // Finance/Ledger table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS finance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mongodb_id TEXT UNIQUE,
      type TEXT, -- 'income', 'expense'
      amount REAL,
      description TEXT,
      date DATETIME,
      branch TEXT,
      synced INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // Customer Ledger table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS customer_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mongodb_id TEXT UNIQUE,
      customer TEXT,
      transactionType TEXT, -- 'sale', 'payment', 'refund'
      amount REAL,
      balance REAL,
      description TEXT,
      date DATETIME,
      branch TEXT,
      synced INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // Settings table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT,
      branch TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  console.log('✅ SQLite database initialized with all tables');
};

export default db;
