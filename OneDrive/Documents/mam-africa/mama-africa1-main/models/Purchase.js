import mongoose from 'mongoose';

const purchaseItemSchema = new mongoose.Schema({
  productId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Product', 
    required: true 
  },
  qty: { 
    type: Number, 
    required: true, 
    min: 1 
  },
  unitCost: { 
    type: Number, 
    required: true, 
    min: 0 
  },
  discount: { 
    type: Number, 
    default: 0, 
    min: 0, 
    max: 100 
  },
  tax: { 
    type: Number, 
    default: 0, 
    min: 0, 
    max: 100 
  },
  total: { 
    type: Number, 
    required: true, 
    min: 0 
  }
});

const purchaseSchema = new mongoose.Schema({
  supplierId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Supplier', 
    required: true 
  },
  items: [purchaseItemSchema],
  subtotal: { 
    type: Number, 
    required: true, 
    min: 0 
  },
  taxTotal: { 
    type: Number, 
    required: true, 
    min: 0 
  },
  discountTotal: { 
    type: Number, 
    required: true, 
    min: 0 
  },
  grandTotal: { 
    type: Number, 
    required: true, 
    min: 0 
  },
  status: { 
    type: String, 
    enum: ['draft', 'submitted', 'paid', 'cancelled'],
    default: 'submitted'
  },
  paymentMethod: { 
    type: String, 
    enum: ['cash', 'credit', 'bank'],
    required: true
  },
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true
  },
  createdBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  notes: String
}, {
  timestamps: true
});

// Add index for better performance
purchaseSchema.index({ branch: 1, createdAt: -1 });
purchaseSchema.index({ supplierId: 1 });

export default mongoose.model('Purchase', purchaseSchema);