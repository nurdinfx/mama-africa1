// SQLite-only auth middleware
import jwt from 'jsonwebtoken';
import { db } from '../db/index.js';
import bcrypt from 'bcryptjs';

// Demo accounts configuration
const DEMO_ACCOUNTS = [
  {
    email: 'admin@demo.com',
    password: 'admin123',
    name: 'Demo Admin',
    role: 'admin'
  },
  {
    email: 'manager@demo.com',
    password: 'manager123',
    name: 'Demo Manager',
    role: 'manager'
  },
  {
    email: 'cashier@demo.com',
    password: 'cashier123',
    name: 'Demo Cashier',
    role: 'cashier'
  },
  {
    email: 'chef@demo.com',
    password: 'chef123',
    name: 'Demo Chef',
    role: 'chef'
  },
  {
    email: 'waiter@demo.com',
    password: 'waiter123',
    name: 'Demo Waiter',
    role: 'waiter'
  }
];

// Helper to get or create demo branch
const getOrCreateDemoBranch = () => {
  let branch = db.prepare('SELECT * FROM branches WHERE branchCode = ?').get('DEMO');
  
  if (!branch) {
    const settings = JSON.stringify({
      taxRate: 10,
      serviceCharge: 5,
      currency: 'USD',
      timezone: 'UTC'
    });
    
    const result = db.prepare(`
      INSERT INTO branches (name, branchCode, address, phone, email, settings, isActive)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      'Demo Restaurant',
      'DEMO',
      '123 Demo Street, Demo City',
      '+1 (555) 123-DEMO',
      'demo@restaurant.com',
      settings,
      1
    );
    
    branch = db.prepare('SELECT * FROM branches WHERE id = ?').get(result.lastInsertRowid);
  }
  
  // Parse settings JSON
  if (branch.settings) {
    try {
      branch.settings = JSON.parse(branch.settings);
    } catch (e) {
      branch.settings = { taxRate: 10, serviceCharge: 5, currency: 'USD', timezone: 'UTC' };
    }
  }
  
  return branch;
};

// Helper to get or create demo user
const getOrCreateDemoUser = (demoAccount, branchId) => {
  let user = db.prepare('SELECT * FROM users WHERE email = ?').get(demoAccount.email);
  
  if (!user) {
    const hashedPassword = bcrypt.hashSync(demoAccount.password, 10);
    const result = db.prepare(`
      INSERT INTO users (name, email, username, password, role, branch, isActive)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      demoAccount.name,
      demoAccount.email,
      demoAccount.email,
      hashedPassword,
      demoAccount.role,
      branchId.toString(),
      1
    );
    
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  }
  
  return user;
};

export const auth = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.header('Authorization');
    let token = null;
    
    if (authHeader) {
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.replace('Bearer ', '');
      } else {
        token = authHeader;
      }
    }
    
    console.log('🔐 Auth middleware - Token received:', token ? (token.substring(0, 20) + '...') : 'No token');
    
    if (!token) {
      console.log('❌ No token provided');
      return res.status(401).json({
        success: false,
        message: 'No token provided. Please login again.',
        code: 'UNAUTHORIZED'
      });
    }

    // Handle demo tokens
    if (token.startsWith('demo-')) {
      console.log('✅ Demo token detected:', token);
      
      const tokenParts = token.split('-');
      if (tokenParts.length < 2) {
        return res.status(401).json({
          success: false,
          message: 'Invalid demo token format'
        });
      }
      
      const demoRole = tokenParts[1];
      const demoAccount = DEMO_ACCOUNTS.find(acc => acc.role === demoRole);
      
      if (!demoAccount) {
        console.log('❌ Demo account not found for role:', demoRole);
        return res.status(401).json({
          success: false,
          message: 'Invalid demo token - role not found'
        });
      }

      // Get or create demo branch
      const demoBranch = getOrCreateDemoBranch();
      
      // Get or create demo user
      const demoUser = getOrCreateDemoUser(demoAccount, demoBranch.id);

      // Set user data in request
      req.user = {
        id: demoUser.id.toString(),
        _id: demoUser.id.toString(),
        name: demoUser.name,
        email: demoUser.email,
        role: demoUser.role,
        isDemo: true,
        branch: {
          _id: demoBranch.id.toString(),
          id: demoBranch.id.toString(),
          name: demoBranch.name,
          branchCode: demoBranch.branchCode,
          settings: demoBranch.settings
        }
      };
      
      return next();
    }

    // Verify real JWT token
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'restaurant-secret-key-2024');
      console.log('✅ JWT token verified successfully');
      
      // Fetch user from SQLite database
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.id);
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User not found'
        });
      }

      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Account is deactivated'
        });
      }

      // Get branch
      const branch = db.prepare('SELECT * FROM branches WHERE id = ?').get(user.branch);
      if (!branch) {
        return res.status(401).json({
          success: false,
          message: 'Branch not found'
        });
      }

      // Parse branch settings
      let branchSettings = {};
      if (branch.settings) {
        try {
          branchSettings = JSON.parse(branch.settings);
        } catch (e) {
          branchSettings = { taxRate: 10, serviceCharge: 5, currency: 'USD', timezone: 'UTC' };
        }
      }

      req.user = {
        id: user.id.toString(),
        _id: user.id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        isDemo: false,
        branch: {
          _id: branch.id.toString(),
          id: branch.id.toString(),
          name: branch.name,
          branchCode: branch.branchCode,
          settings: branchSettings
        }
      };
      
      next();
    } catch (jwtError) {
      console.error('❌ JWT verification failed:', jwtError.message);
      return res.status(401).json({
        success: false,
        message: 'Session expired. Please login again.',
        code: 'UNAUTHORIZED'
      });
    }

  } catch (error) {
    console.error('❌ Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication failed',
      code: 'AUTH_ERROR'
    });
  }
};

// Authorization middleware
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role ${req.user.role} is not authorized to access this route`
      });
    }

    next();
  };
};

// Export default as well for backward compatibility
export default auth;
