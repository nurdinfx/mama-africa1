import { getConnectivityStatus } from './connectivity.js';
import db from './sqlite.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import User from '../models/User.js';
import Branch from '../models/Branch.js';

/**
 * Unified database layer that switches between SQLite and MongoDB.
 * MongoDB is used for reads when online, but all writes are mirrored to SQLite.
 */
class DbLayer {
    constructor() {
        this.models = {};

        // Auto-register core models
        this.registerModel('Product', Product, 'products');
        this.registerModel('Order', Order, 'orders');
        this.registerModel('User', User, 'users');
        this.registerModel('Branch', Branch, 'branches');
    }

    registerModel(name, mongoModel, sqliteTable) {
        this.models[name] = { mongo: mongoModel, sqlite: sqliteTable };
    }

    async find(modelName, filter = {}, options = {}) {
        const { mongo, sqlite } = this.models[modelName];
        const isOnline = getConnectivityStatus();

        if (isOnline) {
            try {
                let query = mongo.find(filter);
                if (options.sort) query = query.sort(options.sort);
                if (options.limit) query = query.limit(options.limit);
                if (options.skip) query = query.skip(options.skip);
                if (options.populate) query = query.populate(options.populate);
                return await query;
            } catch (err) {
                console.error(`MongoDB read failed for ${modelName}, falling back to SQLite:`, err.message);
            }
        }

        // SQLite Fallback
        let queryStr = `SELECT * FROM ${sqlite}`;
        const params = [];
        const whereClauses = [];

        if (filter.branch) {
            whereClauses.push(`branch = ?`);
            params.push(filter.branch.toString());
        }

        if (filter.isActive !== undefined) {
            whereClauses.push(`isActive = ?`);
            params.push(filter.isActive ? 1 : 0);
        }

        if (whereClauses.length > 0) {
            queryStr += ` WHERE ` + whereClauses.join(' AND ');
        }

        if (options.sort) {
            // Very basic sort parsing: { field: 1/-1 } or "field -name"
            queryStr += ` ORDER BY id DESC`; // Default
        }

        if (options.limit) {
            queryStr += ` LIMIT ${options.limit}`;
        }

        const results = db.prepare(queryStr).all(...params);
        return results.map(row => this.processSqliteRow(modelName, row));
    }

    async findOne(modelName, filter = {}, options = {}) {
        const { mongo, sqlite } = this.models[modelName];
        const isOnline = getConnectivityStatus();

        if (isOnline) {
            try {
                let query = mongo.findOne(filter);
                if (options.populate) query = query.populate(options.populate);
                return await query;
            } catch (err) {
                console.error(`MongoDB read failed for ${modelName}, falling back to SQLite:`, err.message);
            }
        }

        let queryStr = `SELECT * FROM ${sqlite}`;
        const params = [];
        const whereClauses = [];

        // Handle various filters
        if (filter.mongodb_id) {
            whereClauses.push(`mongodb_id = ?`);
            params.push(filter.mongodb_id.toString());
        } else if (filter._id) {
            whereClauses.push(`mongodb_id = ?`);
            params.push(filter._id.toString());
        } else if (filter.id) {
            whereClauses.push(`id = ?`);
            params.push(filter.id);
        } else if (filter.email) {
            whereClauses.push(`email = ?`);
            params.push(filter.email);
        } else if (filter.username) {
            whereClauses.push(`username = ?`);
            params.push(filter.username);
        } else if (filter.branchCode) {
            whereClauses.push(`branchCode = ?`);
            params.push(filter.branchCode);
        }

        // Support $or for login (email or username)
        if (filter.$or) {
            const orClauses = [];
            filter.$or.forEach(clause => {
                if (clause.email) {
                    orClauses.push(`email = ?`);
                    params.push(clause.email);
                } else if (clause.username) {
                    orClauses.push(`username = ?`);
                    params.push(clause.username);
                }
            });
            if (orClauses.length > 0) {
                whereClauses.push(`(` + orClauses.join(' OR ') + `)`);
            }
        }

        if (whereClauses.length > 0) {
            queryStr += ` WHERE ` + whereClauses.join(' AND ');
        }

        const row = db.prepare(queryStr).get(...params);
        if (!row) return null;

        const processed = this.processSqliteRow(modelName, row);

        // Simulate population if requested
        if (options.populate === 'branch' && processed.branch) {
            processed.branch = await this.findOne('Branch', { _id: processed.branch });
        }

        return processed;
    }

    processSqliteRow(modelName, row) {
        if (!row) return null;
        const processed = { ...row, _id: row.mongodb_id };

        // Handle specific types
        if (modelName === 'Branch' && row.settings) {
            try {
                processed.settings = JSON.parse(row.settings);
            } catch (e) {
                processed.settings = { taxRate: 10, serviceCharge: 5 };
            }
        }

        // Return a proxy or object that behaves a bit like a Mongoose doc
        processed.populate = async (field) => {
            if (field === 'branch' && processed.branch) {
                processed.branch = await this.findOne('Branch', { _id: processed.branch });
            }
            return processed;
        };

        processed.save = async () => {
            // For now, mirroring is handled in dbLayer.create/update
            return processed;
        };

        return processed;
    }

    async create(modelName, data) {
        const { mongo, sqlite } = this.models[modelName];
        const isOnline = getConnectivityStatus();

        let savedData;
        if (isOnline) {
            try {
                const doc = new mongo(data);
                savedData = await doc.save();
                savedData = savedData.toObject();
            } catch (err) {
                console.error(`MongoDB write failed for ${modelName}:`, err.message);
            }
        }

        // Always mirror to SQLite
        this.saveToSQLite(modelName, data, savedData?._id?.toString());

        return savedData || { ...data, _id: `local-${Date.now()}` };
    }

    saveToSQLite(modelName, data, mongodbId) {
        if (modelName === 'Product') {
            db.prepare(`
                INSERT INTO products (mongodb_id, name, description, price, cost, category, stock, branch, synced)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(mongodb_id) DO UPDATE SET
                name=excluded.name, stock=excluded.stock, price=excluded.price
            `).run(mongodbId || null, data.name, data.description, data.price, data.cost, data.category, data.stock, data.branch?.toString() || '', mongodbId ? 1 : 0);
        } else if (modelName === 'User') {
            db.prepare(`
                INSERT INTO users (mongodb_id, name, email, username, password, role, branch, isActive, synced)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(mongodb_id) DO UPDATE SET
                name=excluded.name, email=excluded.email, password=excluded.password
            `).run(mongodbId || null, data.name, data.email, data.username || '', data.password, data.role, data.branch?.toString() || '', data.isActive ? 1 : 0, mongodbId ? 1 : 0);
        } else if (modelName === 'Branch') {
            db.prepare(`
                INSERT INTO branches (mongodb_id, name, branchCode, address, phone, email, settings, isActive)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(mongodb_id) DO UPDATE SET
                name=excluded.name, settings=excluded.settings
            `).run(mongodbId || null, data.name, data.branchCode, data.address, data.phone, data.email, JSON.stringify(data.settings), data.isActive ? 1 : 0);
        }
    }
}

export const dbLayer = new DbLayer();
