import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  type: {
    type: String,
    enum: ['income', 'expense'],
    required: true
  },
  category: {
    type: String,
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
  paymentMethod: {
    type: String,
    enum: ['cash', 'card', 'bank transfer', 'digital wallet']
  },
  reference: {
    type: String
  },
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  recordedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

const financialReportSchema = new mongoose.Schema({
  period: {
    type: String,
    required: true, // e.g., "2024-01", "2024-Q1"
    unique: true
  },
  startDate: Date,
  endDate: Date,
  totalIncome: {
    type: Number,
    default: 0
  },
  totalExpenses: {
    type: Number,
    default: 0
  },
  netProfit: {
    type: Number,
    default: 0
  },
  transactions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction'
  }],
  summary: {
    foodSales: Number,
    beverageSales: Number,
    otherSales: Number,
    laborCost: Number,
    inventoryCost: Number,
    rent: Number,
    utilities: Number,
    otherExpenses: Number
  }
}, {
  timestamps: true
});

export const Transaction = mongoose.model('Transaction', transactionSchema);
export const FinancialReport = mongoose.model('FinancialReport', financialReportSchema);