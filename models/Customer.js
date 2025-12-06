// models/Customer.js
import mongoose from 'mongoose';

const customerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true, sparse: true },
  phone: { type: String, required: true },
  address: String,
  loyaltyPoints: { type: Number, default: 0 },
  totalOrders: { type: Number, default: 0 },
  totalSpent: { type: Number, default: 0 },
  lastOrder: Date,
  notes: String,
  // Ledger specific fields
  currentBalance: { type: Number, default: 0 },
  totalDebit: { type: Number, default: 0 },
  totalCredit: { type: Number, default: 0 },
  branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true }
}, { timestamps: true });

export default mongoose.model('Customer', customerSchema);