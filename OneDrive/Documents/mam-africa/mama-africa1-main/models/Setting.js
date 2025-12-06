import mongoose from 'mongoose';

const businessHoursSchema = new mongoose.Schema({
  open: {
    type: String,
    required: true,
    match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ // HH:MM format
  },
  close: {
    type: String,
    required: true,
    match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ // HH:MM format
  },
  closed: {
    type: Boolean,
    default: false
  }
});

const settingSchema = new mongoose.Schema({
  // Restaurant Information
  restaurantName: {
    type: String,
    required: true,
    trim: true,
    default: 'Mama Africa Restaurant'
  },
  address: {
    type: String,
    trim: true,
    default: ''
  },
  phone: {
    type: String,
    trim: true,
    default: ''
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    default: ''
  },
  website: {
    type: String,
    trim: true,
    default: ''
  },
  taxId: {
    type: String,
    trim: true,
    default: ''
  },

  // POS Settings
  currency: {
    type: String,
    required: true,
    default: 'USD',
    enum: ['USD', 'EUR', 'GBP', 'CAD', 'AUD']
  },
  taxRate: {
    type: Number,
    required: true,
    default: 10,
    min: 0,
    max: 100
  },
  serviceCharge: {
    type: Number,
    required: true,
    default: 5,
    min: 0,
    max: 100
  },
  receiptHeader: {
    type: String,
    default: 'Mama Africa Restaurant'
  },
  receiptFooter: {
    type: String,
    default: 'Thank you for dining with us!'
  },
  receiptSize: {
    type: String,
    default: '58mm',
    enum: ['58mm', '80mm', 'A4']
  },

  // Business Hours
  businessHours: {
    monday: businessHoursSchema,
    tuesday: businessHoursSchema,
    wednesday: businessHoursSchema,
    thursday: businessHoursSchema,
    friday: businessHoursSchema,
    saturday: businessHoursSchema,
    sunday: businessHoursSchema
  },

  // System Settings
  autoBackup: {
    type: Boolean,
    default: true
  },
  lowStockAlert: {
    type: Boolean,
    default: true
  },
  orderNotifications: {
    type: Boolean,
    default: true
  },
  printReceipt: {
    type: Boolean,
    default: true
  },
  language: {
    type: String,
    default: 'en',
    enum: ['en', 'es', 'fr', 'de']
  },
  timezone: {
    type: String,
    default: 'UTC-5',
    enum: ['UTC-5', 'UTC-6', 'UTC-7', 'UTC-8', 'UTC+0']
  },

  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true,
    unique: true
  }
}, {
  timestamps: true
});

// Pre-save middleware to set default business hours if not provided
settingSchema.pre('save', function(next) {
  if (!this.businessHours.monday) {
    this.businessHours = {
      monday: { open: '09:00', close: '22:00', closed: false },
      tuesday: { open: '09:00', close: '22:00', closed: false },
      wednesday: { open: '09:00', close: '22:00', closed: false },
      thursday: { open: '09:00', close: '22:00', closed: false },
      friday: { open: '09:00', close: '23:00', closed: false },
      saturday: { open: '10:00', close: '23:00', closed: false },
      sunday: { open: '10:00', close: '21:00', closed: false }
    };
  }
  next();
});

export default mongoose.model('Setting', settingSchema);
