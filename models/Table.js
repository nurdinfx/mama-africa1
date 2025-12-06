// backend/models/Table.js
import mongoose from 'mongoose';

const tableSchema = new mongoose.Schema({
  number: {
    type: String,
    required: true,
    trim: true
  },
  tableNumber: {
    type: String,
    required: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  capacity: {
    type: Number,
    required: true,
    min: 1,
    max: 20
  },
  location: {
    type: String,
    enum: ['indoor', 'outdoor', 'terrace', 'vip'],
    default: 'indoor'
  },
  status: {
    type: String,
    enum: ['available', 'occupied', 'reserved', 'cleaning', 'maintenance'],
    default: 'available'
  },
  currentSession: {
    startedAt: Date,
    customers: Number,
    waiter: {
      _id: mongoose.Schema.Types.ObjectId,
      name: String
    }
  },
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true
  }
}, {
  timestamps: true
});

// Index for better performance
tableSchema.index({ branch: 1, number: 1 });
tableSchema.index({ branch: 1, status: 1 });

export default mongoose.model('Table', tableSchema);