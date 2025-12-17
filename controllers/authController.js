import User from '../models/User.js';
import Branch from '../models/Branch.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

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

// Generate token for real users
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET || 'restaurant-secret-key-2024', {
    expiresIn: '2h'
  });
};

// Check if email is a demo account
const isDemoAccount = (email) => {
  return DEMO_ACCOUNTS.some(account => account.email === email);
};

// Get demo account by email
const getDemoAccount = (email) => {
  return DEMO_ACCOUNTS.find(account => account.email === email);
};

// Simple login - supports both email and username
export const login = async (req, res) => {
  try {
    console.log('📥 Login request body:', req.body);

    // Support both email and username fields
    const { email, username, password } = req.body;
    const loginIdentifier = email || username;

    console.log('Login attempt with:', loginIdentifier);

    // Basic validation
    if (!loginIdentifier || !password) {
      console.log('❌ Validation failed - identifier:', loginIdentifier, 'password:', password ? 'provided' : 'missing');
      return res.status(400).json({
        success: false,
        message: 'Email/Username and password are required'
      });
    }

    let user;
    let branch;

    // Check if it's a demo account
    const demoAccount = getDemoAccount(loginIdentifier);
    if (demoAccount) {
      console.log('🔐 Demo account detected:', loginIdentifier);

      if (demoAccount.password !== password) {
        return res.status(401).json({
          success: false,
          message: 'Invalid demo credentials'
        });
      }

      // Create or get demo branch
      branch = await Branch.findOne({ branchCode: 'DEMO' });
      if (!branch) {
        branch = new Branch({
          name: 'Demo Restaurant',
          branchCode: 'DEMO',
          address: '123 Demo Street, Demo City',
          phone: '+1 (555) 123-DEMO',
          email: 'demo@restaurant.com',
          settings: {
            taxRate: 10,
            serviceCharge: 5,
            currency: 'USD',
            timezone: 'UTC'
          },
          createdAt: new Date(),
          updatedAt: new Date()
        });
        await branch.save();
      }

      // Check if demo user exists, if not create one
      user = await User.findOne({
        $or: [{ email: loginIdentifier }, { username: loginIdentifier }]
      }).populate('branch');
      if (!user) {
        user = new User({
          name: demoAccount.name,
          email: demoAccount.email,
          password: await bcrypt.hash(demoAccount.password, 10),
          role: demoAccount.role,
          branch: branch._id,
          isDemo: true,
          isActive: true,
          lastLogin: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        });
        await user.save();
        await user.populate('branch');
      } else {
        // Update last login for existing demo user
        user.lastLogin = new Date();
        await user.save();
      }

      // For demo accounts, use simple token format with timestamp
      const token = `demo-${user.role}-${Date.now()}`;

      const userData = {
        id: user._id,
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isDemo: true,
        permissions: getPermissionsByRole(user.role),
        branch: {
          _id: branch._id,
          name: branch.name,
          branchCode: branch.branchCode,
          settings: branch.settings
        },
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
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

    } else {
      // Real account login - search by email or username
      console.log('🔐 Real account login attempt:', loginIdentifier);
      user = await User.findOne({
        $or: [{ email: loginIdentifier }, { username: loginIdentifier }]
      }).populate('branch');
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email/username or password'
        });
      }

      // Check password
      const isPasswordValid = await bcrypt.compare(password, user.password);
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

      branch = user.branch;

      // Generate JWT token for real users
      const token = generateToken(user._id);

      // Update last login
      user.lastLogin = new Date();
      await user.save();

      const userData = {
        id: user._id,
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isDemo: false,
        permissions: getPermissionsByRole(user.role),
        branch: {
          _id: branch._id,
          name: branch.name,
          branchCode: branch.branchCode,
          settings: branch.settings
        },
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
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
    }

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
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

// Simple registration for real accounts
export const register = async (req, res) => {
  try {
    const { name, email, username, password, role, branchId } = req.body;

    console.log('Registration attempt:', email || username);

    // Basic validation - require either email or username
    if (!name || (!email && !username) || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email/username, and password are required'
      });
    }

    // Check if email is a demo account
    if (email && isDemoAccount(email)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot register with demo account email'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [
        ...(email ? [{ email }] : []),
        ...(username ? [{ username }] : [])
      ]
    });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email or username'
      });
    }

    // Get or create branch
    let branch;
    if (branchId) {
      branch = await Branch.findById(branchId);
    } else {
      // Create a default branch for new registrations
      branch = await Branch.findOne({ branchCode: 'MAIN' });
      if (!branch) {
        branch = new Branch({
          name: 'My Restaurant',
          branchCode: 'MAIN',
          address: 'Add your restaurant address',
          phone: '+1 (555) 123-4567',
          email: email,
          settings: {
            taxRate: 10,
            serviceCharge: 5,
            currency: 'USD',
            timezone: 'UTC'
          },
          createdAt: new Date(),
          updatedAt: new Date()
        });
        await branch.save();
      }
    }

    if (!branch) {
      return res.status(400).json({
        success: false,
        message: 'Branch not found'
      });
    }

    // Create user
    const user = new User({
      name,
      email: email || `${username}@local.user`,
      username,
      password: await bcrypt.hash(password, 10),
      role: role || 'manager',
      branch: branch._id,
      isDemo: false,
      isActive: true,
      lastLogin: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await user.save();
    await user.populate('branch');

    // Generate token
    const token = generateToken(user._id);

    const userData = {
      id: user._id,
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isDemo: false,
      permissions: getPermissionsByRole(user.role),
      branch: {
        _id: branch._id,
        name: branch.name,
        branchCode: branch.branchCode,
        settings: branch.settings
      },
      createdAt: user.createdAt,
      lastLogin: user.lastLogin
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

// Get current user
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('-password')
      .populate('branch');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const userData = {
      id: user._id,
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isDemo: user.isDemo || false,
      permissions: getPermissionsByRole(user.role),
      branch: user.branch,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin
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

// Simple logout
export const logout = async (req, res) => {
  console.log('🚪 Logout for user:', req.user.email);
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

// Check if email exists
export const checkEmail = async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const user = await User.findOne({ email });
    const exists = !!user;

    res.json({
      success: true,
      data: {
        exists,
        isDemo: isDemoAccount(email)
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
