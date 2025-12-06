import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Branch from '../models/Branch.js';
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

export const auth = async (req, res, next) => {
  try {
    // Get token from header - handle both "Bearer token" and direct token formats
    const authHeader = req.header('Authorization');
    let token = null;
    
    if (authHeader) {
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.replace('Bearer ', '');
      } else {
        // Direct token (for demo tokens)
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

    // Handle demo tokens (simple string tokens)
    if (token.startsWith('demo-')) {
      console.log('✅ Demo token detected:', token);
      
      // Extract demo user type from token (e.g., "demo-admin-1234567890" -> "admin")
      // Token format: demo-{role}-{timestamp}
      const tokenParts = token.split('-');
      if (tokenParts.length < 2) {
        return res.status(401).json({
          success: false,
          message: 'Invalid demo token format'
        });
      }
      
      // Get role (second part after "demo")
      const demoRole = tokenParts[1]; // e.g., "admin" from "demo-admin-1234567890"
      const demoAccount = DEMO_ACCOUNTS.find(acc => acc.role === demoRole);
      
      if (!demoAccount) {
        console.log('❌ Demo account not found for role:', demoRole);
        return res.status(401).json({
          success: false,
          message: 'Invalid demo token - role not found'
        });
      }

      // Get or create demo branch
      let demoBranch = await Branch.findOne({ branchCode: 'DEMO' });
      if (!demoBranch) {
        demoBranch = new Branch({
          name: 'Demo Restaurant',
          branchCode: 'DEMO',
          address: '123 Demo Street, Demo City',
          phone: '+1 (555) 123-DEMO',
          email: 'demo@restaurant.com',
          settings: {
            taxRate: 10,
            serviceCharge: 5
          }
        });
        await demoBranch.save();
      }

      // Get or create demo user
      let demoUser = await User.findOne({ email: demoAccount.email }).populate('branch');
      if (!demoUser) {
        demoUser = new User({
          name: demoAccount.name,
          email: demoAccount.email,
          password: await bcrypt.hash(demoAccount.password, 10),
          role: demoAccount.role,
          branch: demoBranch._id,
          isDemo: true
        });
        await demoUser.save();
        await demoUser.populate('branch');
      }

      // Set user data in request
      req.user = {
        id: demoUser._id,
        _id: demoUser._id,
        name: demoUser.name,
        email: demoUser.email,
        role: demoUser.role,
        isDemo: true,
        branch: demoUser.branch
      };
      
      return next();
    }

    // Verify real JWT token
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'restaurant-secret-key-2024');
      console.log('✅ JWT token verified successfully');
      
      // Fetch user from database
      const user = await User.findById(decoded.id).populate('branch');
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

      req.user = {
        id: user._id,
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isDemo: user.isDemo || false,
        branch: user.branch
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