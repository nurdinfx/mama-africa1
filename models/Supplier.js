import mongoose from 'mongoose';

const supplierSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true, 
    trim: true 
  },
  contact: {
    phone: { 
      type: String, 
      required: true 
    },
    email: { 
      type: String, 
      required: true,
      lowercase: true 
    }
  },
  address: { 
    type: String, 
    required: true 
  },
  paymentTerms: { 
    type: String, 
    default: '30 days' 
  },
  bankDetails: {
    accountNumber: String,
    bankName: String,
    ifscCode: String
  },
  rating: { 
    type: Number, 
    min: 0, 
    max: 5, 
    default: 0 
  },
  balance: { 
    type: Number, 
    default: 0 
  },
  active: { 
    type: Boolean, 
    default: true 
  }
}, {
  timestamps: true
});

export default mongoose.model('Supplier', supplierSchema);