import mongoose from 'mongoose';

const menuItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Menu item name is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: 0
  },
  cost: {
    type: Number,
    required: [true, 'Cost is required'],
    min: 0
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: ['appetizer', 'main course', 'dessert', 'beverage', 'alcohol', 'special']
  },
  image: {
    type: String,
    default: ''
  },
  ingredients: [{
    inventoryItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Inventory'
    },
    quantity: Number,
    unit: String
  }],
  preparationTime: {
    type: Number, // in minutes
    default: 15
  },
  isAvailable: {
    type: Boolean,
    default: true
  },
  tags: [String],
  nutritionalInfo: {
    calories: Number,
    protein: Number,
    carbs: Number,
    fat: Number
  }
}, {
  timestamps: true
});

export default mongoose.model('MenuItem', menuItemSchema);