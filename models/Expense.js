import mongoose from 'mongoose';

const expenseSchema = new mongoose.Schema({
  description: { type: String, required: true },
  amount: { type: Number, required: true },
  category: { 
    type: String, 
    enum: ['food', 'supplies', 'utilities', 'salaries', 'rent', 'maintenance', 'other'],
    required: true 
  },
  date: { type: Date, required: true },
  receipt: String,
  notes: String,
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true }
}, { timestamps: true });

export default mongoose.model('Expense', expenseSchema);