// SQLite-only authentication controller
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';

// Demo accounts data
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

// Generate token
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET || 'restaurant-secret-key-2024', {
    expiresIn: '2h'
  });
};

// Helper function to get permissions by role
const getPermissionsByRole = (role) => {
  const permissions = {
    admin: ['read', 'write', 'delete', 'manage_users', 'view_reports', 'manage_settings'],
    manager: ['read', 'write', 'view_reports', 'manage_orders'],
    cashier: ['read', 'write', 'process_payments', 'manage_orders'],
    chef: ['read', 'update_orders', 'view_kitchen'],
    waiter: ['read', 'create_orders', 'update_orders']
  };
  return permissions[role] || ['read'];
};

// Get or create demo branch
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

// Get or create demo user
const getOrCreateDemoUser = (demoAccount, branchId) => {
  let user = db.prepare('SELECT * FROM users WHERE email = ? OR username = ?').get(demoAccount.email, demoAccount.email);
  
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
  } else {
    // Update last login
    db.prepare('UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
  }
  
  return user;
};

// Login - SQLite only
export const login = async (req, res) => {
  try {
    console.log('📥 Login request body:', req.body);

    const { email, username, password } = req.body;
    const loginIdentifier = email || username;

    if (!loginIdentifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email/Username and password are required'
      });
    }

    // Check if demo account
    const demoAccount = DEMO_ACCOUNTS.find(acc => acc.email === loginIdentifier);
    
    if (demoAccount) {
      console.log('🔐 Demo account detected:', loginIdentifier);

      if (demoAccount.password !== password) {
        return res.status(401).json({
          success: false,
          message: 'Invalid demo credentials'
        });
      }

      // Get or create demo branch
      const branch = getOrCreateDemoBranch();
      
      // Get or create demo user
      const user = getOrCreateDemoUser(demoAccount, branch.id);

      const token = `demo-${user.role}-${Date.now()}`;

      const userData = {
        id: user.id.toString(),
        _id: user.id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        isDemo: true,
        permissions: getPermissionsByRole(user.role),
        branch: {
          _id: branch.id.toString(),
          name: branch.name,
          branchCode: branch.branchCode,
          settings: branch.settings
        },
        createdAt: user.updated_at,
        lastLogin: new Date().toISOString()
      };

      console.log('✅ Demo login successful for:', user.email);

      return res.json({
        success: true,
        message: 'Demo login successful',
        data: {
          token,
          user: userData
        }
      });
    }

    // Real account login
    console.log('🔐 Real account login attempt:', loginIdentifier);
    const user = db.prepare('SELECT * FROM users WHERE email = ? OR username = ?').get(loginIdentifier, loginIdentifier);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email/username or password'
      });
    }

    // Check password
    const isPasswordValid = bcrypt.compareSync(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email/username or password'
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

    // Generate JWT token
    const token = generateToken(user.id.toString());

    // Update last login
    db.prepare('UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

    const userData = {
      id: user.id.toString(),
      _id: user.id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      isDemo: false,
      permissions: getPermissionsByRole(user.role),
      branch: {
        _id: branch.id.toString(),
        name: branch.name,
        branchCode: branch.branchCode,
        settings: branchSettings
      },
      createdAt: user.updated_at,
      lastLogin: new Date().toISOString()
    };

    console.log('✅ Real login successful for:', user.email);

    return res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: userData
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
};

// Registration - SQLite only
export const register = async (req, res) => {
  try {
    const { name, email, username, password, role, branchId } = req.body;

    console.log('Registration attempt:', email || username);

    if (!name || (!email && !username) || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email/username, and password are required'
      });
    }

    // Check if demo account
    if (email && DEMO_ACCOUNTS.some(acc => acc.email === email)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot register with demo account email'
      });
    }

    // Check if user exists
    const existingUser = db.prepare('SELECT * FROM users WHERE email = ? OR username = ?').get(email || '', username || '');
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email or username'
      });
    }

    // Get or create branch
    let branch;
    if (branchId) {
      branch = db.prepare('SELECT * FROM branches WHERE id = ?').get(branchId);
    } else {
      branch = db.prepare('SELECT * FROM branches WHERE branchCode = ?').get('MAIN');
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
          'My Restaurant',
          'MAIN',
          'Add your restaurant address',
          '+1 (555) 123-4567',
          email || `${username}@local.user`,
          settings,
          1
        );
        
        branch = db.prepare('SELECT * FROM branches WHERE id = ?').get(result.lastInsertRowid);
      }
    }

    if (!branch) {
      return res.status(400).json({
        success: false,
        message: 'Branch not found'
      });
    }

    // Create user
    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = db.prepare(`
      INSERT INTO users (name, email, username, password, role, branch, isActive)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      name,
      email || `${username}@local.user`,
      username,
      hashedPassword,
      role || 'manager',
      branch.id.toString(),
      1
    );

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);

    // Parse branch settings
    let branchSettings = {};
    if (branch.settings) {
      try {
        branchSettings = JSON.parse(branch.settings);
      } catch (e) {
        branchSettings = { taxRate: 10, serviceCharge: 5, currency: 'USD', timezone: 'UTC' };
      }
    }

    // Generate token
    const token = generateToken(user.id.toString());

    const userData = {
      id: user.id.toString(),
      _id: user.id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      isDemo: false,
      permissions: getPermissionsByRole(user.role),
      branch: {
        _id: branch.id.toString(),
        name: branch.name,
        branchCode: branch.branchCode,
        settings: branchSettings
      },
      createdAt: user.updated_at,
      lastLogin: new Date().toISOString()
    };

    console.log('✅ Registration successful for:', user.email);

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        token,
        user: userData
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during registration'
    });
  }
};

// Get current user - SQLite only
export const getMe = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get branch
    const branch = db.prepare('SELECT * FROM branches WHERE id = ?').get(user.branch);
    if (!branch) {
      return res.status(404).json({
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

    const userData = {
      id: user.id.toString(),
      _id: user.id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      isDemo: false,
      permissions: getPermissionsByRole(user.role),
      branch: {
        _id: branch.id.toString(),
        name: branch.name,
        branchCode: branch.branchCode,
        settings: branchSettings
      },
      createdAt: user.updated_at,
      lastLogin: new Date().toISOString()
    };

    res.json({
      success: true,
      data: userData
    });

  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Logout
export const logout = async (req, res) => {
  console.log('🚪 Logout for user:', req.user?.email || req.user?.id);
  res.json({
    success: true,
    message: 'Logout successful'
  });
};

// Get demo accounts info
export const getDemoAccounts = async (req, res) => {
  res.json({
    success: true,
    data: DEMO_ACCOUNTS.map(acc => ({
      email: acc.email,
      password: acc.password,
      role: acc.role,
      name: acc.name
    }))
  });
};

// Check if email exists - SQLite only
export const checkEmail = async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    const exists = !!user;

    res.json({
      success: true,
      data: {
        exists,
        isDemo: DEMO_ACCOUNTS.some(acc => acc.email === email)
      }
    });

  } catch (error) {
    console.error('Check email error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};
