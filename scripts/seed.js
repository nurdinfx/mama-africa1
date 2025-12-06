import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import User from '../models/User.js';
import Branch from '../models/Branch.js';
import MenuItem from '../models/MenuItem.js';
import Inventory from '../models/Inventory.js';
import Customer from '../models/Customer.js';

dotenv.config();

const seedData = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Clear existing data (optional - comment out if you want to keep existing data)
    // await User.deleteMany({});
    // await MenuItem.deleteMany({});
    // await Inventory.deleteMany({});
    // await Customer.deleteMany({});

    // Create or get main branch
    let mainBranch = await Branch.findOne({ branchCode: 'MAIN' });
    if (!mainBranch) {
      mainBranch = new Branch({
        name: 'Main Restaurant',
        branchCode: 'MAIN',
        address: '123 Main Street, City',
        phone: '+1 (555) 123-4567',
        email: 'info@restaurant.com',
        settings: {
          taxRate: 10,
          serviceCharge: 5,
          currency: 'USD',
          timezone: 'UTC'
        }
      });
      await mainBranch.save();
      console.log('✅ Created main branch');
    } else {
      console.log('✅ Using existing main branch');
    }

    // Create admin user (only if doesn't exist)
    let adminUser = await User.findOne({ email: 'admin@restaurant.com' });
    if (!adminUser) {
      adminUser = new User({
        name: 'Admin User',
        email: 'admin@restaurant.com',
        password: 'admin123',
        role: 'admin',
        phone: '+1234567890',
        branch: mainBranch._id,
        isActive: true,
        isDemo: false
      });
      await adminUser.save();
      console.log('✅ Created admin user');
    } else {
      console.log('✅ Admin user already exists');
    }

    // Create staff users (only if they don't exist)
    const staffUsers = [
      {
        name: 'Manager John',
        email: 'manager@restaurant.com',
        password: 'manager123',
        role: 'manager',
        phone: '+1234567891'
      },
      {
        name: 'Chef Maria',
        email: 'chef@restaurant.com',
        password: 'chef123',
        role: 'chef',
        phone: '+1234567892'
      },
      {
        name: 'Waiter Mike',
        email: 'waiter@restaurant.com',
        password: 'waiter123',
        role: 'waiter',
        phone: '+1234567893'
      },
      {
        name: 'Cashier Sarah',
        email: 'cashier@restaurant.com',
        password: 'cashier123',
        role: 'cashier',
        phone: '+1234567894'
      }
    ];

    for (const userData of staffUsers) {
      const existingUser = await User.findOne({ email: userData.email });
      if (!existingUser) {
        const user = new User({
          ...userData,
          branch: mainBranch._id,
          isActive: true,
          isDemo: false
        });
        await user.save();
        console.log(`✅ Created user: ${userData.name}`);
      } else {
        console.log(`✅ User already exists: ${userData.name}`);
      }
    }

    const existingNuur = await User.findOne({ $or: [{ email: 'nuurdiin12@example.com' }, { username: 'nuurdiin12' }] });
    if (!existingNuur) {
      const nuur = new User({
        name: 'Nuurdiin',
        email: 'nuurdiin12@example.com',
        username: 'nuurdiin12',
        password: 'test123',
        role: 'manager',
        phone: '+252000000',
        branch: mainBranch._id,
        isActive: true,
        isDemo: false
      });
      await nuur.save();
      console.log('✅ Created user: Nuurdiin');
    } else {
      console.log('✅ User already exists: Nuurdiin');
    }

    // Create inventory items
    const inventoryItems = [
      {
        name: 'Chicken Breast',
        category: 'meat',
        currentStock: 50,
        minStock: 10,
        unit: 'kg',
        costPerUnit: 8.5,
        supplier: {
          name: 'Fresh Meat Co.',
          contact: '+1987654321',
          email: 'orders@freshmeat.com'
        }
      },
      {
        name: 'Rice',
        category: 'grains',
        currentStock: 100,
        minStock: 20,
        unit: 'kg',
        costPerUnit: 2.5,
        supplier: {
          name: 'Grain Suppliers Ltd',
          contact: '+1987654322',
          email: 'sales@grains.com'
        }
      },
      {
        name: 'Tomatoes',
        category: 'vegetables',
        currentStock: 30,
        minStock: 5,
        unit: 'kg',
        costPerUnit: 3.0,
        supplier: {
          name: 'Fresh Veggies Inc',
          contact: '+1987654323',
          email: 'info@freshveggies.com'
        }
      },
      {
        name: 'Cooking Oil',
        category: 'other',
        currentStock: 20,
        minStock: 5,
        unit: 'l',
        costPerUnit: 4.0,
        supplier: {
          name: 'Oil Distributors',
          contact: '+1987654324',
          email: 'sales@oildist.com'
        }
      }
    ];

    const createdInventory = await Inventory.insertMany(inventoryItems);

    // Create menu items
    const menuItems = [
      {
        name: 'Grilled Chicken',
        description: 'Juicy grilled chicken breast with herbs and spices',
        price: 18.99,
        cost: 6.50,
        category: 'main course',
        preparationTime: 20,
        ingredients: [
          {
            inventoryItem: createdInventory[0]._id,
            quantity: 0.3,
            unit: 'kg'
          },
          {
            inventoryItem: createdInventory[3]._id,
            quantity: 0.05,
            unit: 'l'
          }
        ]
      },
      {
        name: 'Chicken Fried Rice',
        description: 'Stir-fried rice with chicken, vegetables and soy sauce',
        price: 14.99,
        cost: 4.20,
        category: 'main course',
        preparationTime: 15,
        ingredients: [
          {
            inventoryItem: createdInventory[0]._id,
            quantity: 0.2,
            unit: 'kg'
          },
          {
            inventoryItem: createdInventory[1]._id,
            quantity: 0.15,
            unit: 'kg'
          },
          {
            inventoryItem: createdInventory[2]._id,
            quantity: 0.1,
            unit: 'kg'
          }
        ]
      },
      {
        name: 'Caesar Salad',
        description: 'Fresh romaine lettuce with Caesar dressing and croutons',
        price: 12.99,
        cost: 3.80,
        category: 'appetizer',
        preparationTime: 10
      },
      {
        name: 'Chocolate Cake',
        description: 'Rich chocolate cake with chocolate frosting',
        price: 8.99,
        cost: 2.50,
        category: 'dessert',
        preparationTime: 5
      },
      {
        name: 'Orange Juice',
        description: 'Freshly squeezed orange juice',
        price: 4.99,
        cost: 1.20,
        category: 'beverage',
        preparationTime: 2
      }
    ];

    await MenuItem.insertMany(menuItems);

    // Create sample customers
    const customers = [
      {
        name: 'John Smith',
        email: 'john.smith@email.com',
        phone: '+1234567890',
        loyaltyPoints: 150,
        totalSpent: 450,
        visitCount: 5
      },
      {
        name: 'Emma Johnson',
        email: 'emma.johnson@email.com',
        phone: '+1234567891',
        loyaltyPoints: 75,
        totalSpent: 225,
        visitCount: 3
      }
    ];

    await Customer.insertMany(customers);

    console.log('Database seeded successfully!');
    console.log('Admin login: admin@restaurant.com / admin123');
    console.log('Manager login: manager@restaurant.com / manager123');
    
    process.exit(0);
  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  }
};

seedData();
