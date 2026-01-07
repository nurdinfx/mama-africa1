import db from './sqlite.js';
import { getConnectivityStatus } from './connectivity.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import User from '../models/User.js';
import Customer from '../models/Customer.js';
import Table from '../models/Table.js';

/**
 * Pushes local SQLite changes to MongoDB.
 */
export const syncUp = async () => {
    if (!getConnectivityStatus()) return;

    console.log('🔄 Starting Sync-UP (SQLite -> MongoDB)...');

    try {
        // 1. Sync Products
        const unsyncedProducts = db.prepare('SELECT * FROM products WHERE synced = 0').all();
        for (const prod of unsyncedProducts) {
            try {
                let mongoProd;
                if (prod.mongodb_id) {
                    mongoProd = await Product.findByIdAndUpdate(prod.mongodb_id, prod, { new: true, upsert: true });
                } else {
                    // Check if already exists by SKU to avoid duplicates
                    if (prod.sku) {
                        mongoProd = await Product.findOne({ sku: prod.sku, branch: prod.branch });
                    }
                    if (mongoProd) {
                        await Product.findByIdAndUpdate(mongoProd._id, prod);
                    } else {
                        mongoProd = new Product({ ...prod });
                        await mongoProd.save();
                    }
                }
                db.prepare('UPDATE products SET mongodb_id = ?, synced = 1 WHERE id = ?')
                    .run(mongoProd._id.toString(), prod.id);
            } catch (err) {
                console.error(`Failed to sync product ${prod.name}:`, err.message);
            }
        }

        // 2. Sync Orders
        const unsyncedOrders = db.prepare('SELECT * FROM orders WHERE synced = 0').all();
        for (const order of unsyncedOrders) {
            try {
                // Need to get order items too
                const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
                const orderData = { ...order, items: items.map(i => ({ product: i.product_id, quantity: i.quantity, price: i.price, total: i.total })) };

                delete orderData.id;
                delete orderData.synced;

                let mongoOrder = new Order(orderData);
                await mongoOrder.save();

                db.prepare('UPDATE orders SET mongodb_id = ?, synced = 1 WHERE id = ?')
                    .run(mongoOrder._id.toString(), order.id);
            } catch (err) {
                console.error(`Failed to sync order ${order.orderNumber}:`, err.message);
            }
        }

        // Add other entities (Customers, Tables, etc.) as needed...

        console.log('✅ Sync-UP completed');
    } catch (error) {
        console.error('❌ Sync-UP failed:', error.message);
    }
};

/**
 * Pulls MongoDB data into local SQLite.
 */
export const syncDown = async () => {
    if (!getConnectivityStatus()) return;

    console.log('🔄 Starting Sync-DOWN (MongoDB -> SQLite)...');

    try {
        // 1. Sync Products
        const mongoProducts = await Product.find({});
        for (const prod of mongoProducts) {
            const prodData = prod.toObject();
            db.prepare(`
        INSERT INTO products (mongodb_id, name, description, price, cost, category, stock, minStock, isAvailable, active, image, sku, barcode, branch, synced, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        ON CONFLICT(mongodb_id) DO UPDATE SET
          name=excluded.name, description=excluded.description, price=excluded.price, cost=excluded.cost, 
          category=excluded.category, stock=excluded.stock, minStock=excluded.minStock, 
          isAvailable=excluded.isAvailable, active=excluded.active, image=excluded.image, 
          sku=excluded.sku, barcode=excluded.barcode, branch=excluded.branch, updated_at=excluded.updated_at
      `).run(
                prodData._id.toString(), prodData.name, prodData.description || '', prodData.price, prodData.cost || 0,
                prodData.category, prodData.stock || 0, prodData.minStock || 10, prodData.isAvailable ? 1 : 0,
                prodData.active ? 1 : 0, prodData.image || '', prodData.sku || '', prodData.barcode || '',
                prodData.branch.toString(), prodData.updatedAt.toISOString()
            );
        }

        // 2. Sync Users (Critical for offline login)
        const mongoUsers = await User.find({});
        for (const user of mongoUsers) {
            const userData = user.toObject();
            db.prepare(`
        INSERT INTO users (mongodb_id, name, email, username, password, role, branch, isActive, synced, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        ON CONFLICT(mongodb_id) DO UPDATE SET
          name=excluded.name, email=excluded.email, username=excluded.username, 
          password=excluded.password, role=excluded.role, branch=excluded.branch, 
          isActive=excluded.isActive, updated_at=excluded.updated_at
      `).run(
                userData._id.toString(), userData.name, userData.email, userData.username || '',
                userData.password, userData.role, userData.branch.toString(),
                userData.isActive ? 1 : 0, userData.updatedAt.toISOString()
            );
        }

        console.log('✅ Sync-DOWN completed');
    } catch (error) {
        console.error('❌ Sync-DOWN failed:', error.message);
    }
};

/**
 * Triggers a full background sync.
 */
export const triggerSync = async () => {
    await syncUp();
    await syncDown();
};

export default {
    syncUp,
    syncDown,
    triggerSync
};
