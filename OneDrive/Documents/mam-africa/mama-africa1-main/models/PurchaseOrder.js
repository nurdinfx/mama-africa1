import mongoose from 'mongoose';

const poItemSchema = new mongoose.Schema({
  productId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Product', 
    required: true 
  },
  orderedQty: { 
    type: Number, 
    required: true, 
    min: 1 
  },
  receivedQty: { 
    type: Number, 
    default: 0, 
    min: 0 
  },
  unitCost: { 
    type: Number, 
    required: true, 
    min: 0 
  },
  total: { 
    type: Number, 
    required: true, 
    min: 0 
  }
});

const purchaseOrderSchema = new mongoose.Schema({
  supplierId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Supplier', 
    required: true 
  },
  items: [poItemSchema],
  expectedDelivery: { 
    type: Date, 
    required: true 
  },
  status: { 
    type: String, 
    enum: ['draft', 'pending', 'approved', 'received', 'cancelled'],
    default: 'draft'
  },
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
  approvedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  approvedAt: Date,
  receivedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  receivedAt: Date,
  notes: String
}, {
  timestamps: true
});

purchaseOrderSchema.index({ branch: 1, createdAt: -1 })
purchaseOrderSchema.index({ supplierId: 1 })

export default mongoose.model('PurchaseOrder', purchaseOrderSchema);
