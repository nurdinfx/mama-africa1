import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  notes: String,
  modifiers: [String],
  total: {
    type: Number,
    required: true
  }
});

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    required: true,
    unique: true
  },
  items: [orderItemSchema],
  orderType: {
    type: String,
    enum: ['dine-in', 'takeaway', 'delivery'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'preparing', 'ready', 'served', 'completed', 'cancelled', 'delayed'],
    default: 'pending'
  },
  kitchenStatus: {
    type: String,
    enum: ['pending', 'preparing', 'ready', 'served', 'delayed'],
    default: 'pending'
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer'
  },
  table: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Table'
  },
  tableNumber: String,
  customerName: String,
  customerPhone: String,
  subtotal: {
    type: Number,
    required: true,
    min: 0
  },
  tax: {
    type: Number,
    default: 0,
    min: 0
  },
  discount: {
    type: Number,
    default: 0,
    min: 0
  },
  serviceCharge: {
    type: Number,
    default: 0,
    min: 0
  },
  finalTotal: {
    type: Number,
    required: true,
    min: 0
  },
  tip: {
    type: Number,
    default: 0,
    min: 0
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'card', 'mobile', 'credit', 'zaad', 'sahal', 'edahab', 'mycash', 'bank'],
    default: 'cash'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'refunded', 'failed'],
    default: 'pending'
  },
  cashier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true
  },
  kitchenNotes: String,
  specialInstructions: String,
  preparationTime: Number,
  servedAt: Date,
  completedAt: Date
}, {
  timestamps: true
});

// Pre-save middleware to calculate totals
orderSchema.pre('save', function (next) {
  // Calculate item totals
  this.items.forEach(item => {
    item.total = item.price * item.quantity;
  });

  // Calculate subtotal
  this.subtotal = this.items.reduce((sum, item) => sum + item.total, 0);

  // Calculate final total
  this.finalTotal = this.subtotal + this.tax + this.serviceCharge - this.discount + (this.tip || 0);

  next();
});

// Static method to generate order number
orderSchema.statics.generateOrderNumber = async function (branchCode) {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `ORD-${branchCode}-${dateStr}`;

  const lastOrder = await this.findOne({
    orderNumber: new RegExp(`^${prefix}`)
  }).sort({ orderNumber: -1 });

  let sequence = 1;
  if (lastOrder) {
    const lastSequence = parseInt(lastOrder.orderNumber.slice(-4));
    sequence = lastSequence + 1;
  }

  return `${prefix}-${sequence.toString().padStart(4, '0')}`;
};

// Index for better performance
orderSchema.index({ branch: 1, createdAt: -1 });
orderSchema.index({ status: 1 });
orderSchema.index({ kitchenStatus: 1 });
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ createdAt: 1 });

// Virtual for order duration
orderSchema.virtual('duration').get(function () {
  if (this.completedAt && this.createdAt) {
    return Math.round((this.completedAt - this.createdAt) / 60000); // minutes
  }
  return null;
});

// Virtual for kitchen duration
orderSchema.virtual('kitchenDuration').get(function () {
  if (this.updatedAt && this.createdAt) {
    return Math.round((this.updatedAt - this.createdAt) / 60000); // minutes
  }
  return null;
});

export default mongoose.model('Order', orderSchema);
