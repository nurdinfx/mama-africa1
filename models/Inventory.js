import mongoose from 'mongoose';

const inventorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Inventory item name is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: ['vegetables', 'meat', 'dairy', 'beverages', 'spices', 'grains', 'fruits', 'other']
  },
  currentStock: {
    type: Number,
    required: true,
    min: 0
  },
  minStock: {
    type: Number,
    required: true,
    min: 0
  },
  unit: {
    type: String,
    required: true,
    enum: ['kg', 'g', 'l', 'ml', 'pieces', 'packets', 'boxes']
  },
  costPerUnit: {
    type: Number,
    required: true,
    min: 0
  },
  supplier: {
    name: String,
    contact: String,
    email: String,
    phone: String
  },
  image: {
    type: String,
    default: ''
  },
  barcode: {
    type: String,
    trim: true
  },
  expiryDate: {
    type: Date
  },
  lastRestocked: {
    type: Date
  },
  isLowStock: {
    type: Boolean,
    default: false
  },
  reorderQuantity: {
    type: Number,
    default: 0
  },
  location: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Check low stock before saving
inventorySchema.pre('save', function(next) {
  this.isLowStock = this.currentStock <= this.minStock;
  next();
});

export default mongoose.model('Inventory', inventorySchema);