import mongoose from 'mongoose';

const branchSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  branchCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true
  },
  address: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  taxId: String,
  logo: String,
  isActive: {
    type: Boolean,
    default: true
  },
  settings: {
    taxRate: { type: Number, default: 10 },
    serviceCharge: { type: Number, default: 5 }
  }
}, {
  timestamps: true
});

export default mongoose.model('Branch', branchSchema);