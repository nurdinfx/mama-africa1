// models/Ledger.js
import mongoose from 'mongoose';

const ledgerSchema = new mongoose.Schema({
  customer: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Customer', 
    required: true 
  },
  date: { 
    type: Date, 
    default: Date.now,
    required: true 
  },
  type: { 
    type: String, 
    enum: ['debit', 'credit'], 
    required: true 
  },
  amount: { 
    type: Number, 
    required: true,
    min: 0
  },
  description: { 
    type: String, 
    required: true 
  },
  balance: { 
    type: Number, 
    required: true 
  },
  reference: String,
  branch: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Branch', 
    required: true 
  }
}, { timestamps: true });

export default mongoose.model('Ledger', ledgerSchema);