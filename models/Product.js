import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    maxlength: [100, 'Product name cannot exceed 100 characters']
  },
  description: {
    type: String,
    maxlength: [500, 'Description cannot exceed 500 characters'],
    default: ''
  },
  // PRICE FIELDS - Consolidated to avoid confusion
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price cannot be negative'],
    default: 0
  },
  cost: {
    type: Number,
    min: [0, 'Cost cannot be negative'],
    default: 0
  },
  // COST FIELDS - Map costPrice to cost for consistency
  costPrice: {
    type: Number,
    min: [0, 'Cost price cannot be negative'],
    default: 0
  },
  
  category: {
    type: String,
    required: [true, 'Category is required'],
    trim: true,
    maxlength: [50, 'Category cannot exceed 50 characters']
  },
  
  // STOCK MANAGEMENT
  stock: {
    type: Number,
    default: 0,
    min: [0, 'Stock cannot be negative']
  },
  minStock: {
    type: Number,
    default: 10,
    min: [0, 'Minimum stock cannot be negative']
  },
  
  // PRODUCT STATUS
  isAvailable: {
    type: Boolean,
    default: true
  },
  active: {
    type: Boolean,
    default: true
  },
  
  // MEDIA
  image: {
    type: String,
    default: ''
  },
  
  // BRAND & IDENTIFICATION
  sku: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    uppercase: true
  },
  barcode: {
    type: String,
    sparse: true,
    trim: true
  },
  brand: {
    type: String,
    trim: true,
    maxlength: [50, 'Brand cannot exceed 50 characters']
  },
  
  // UNIT & MEASUREMENT
  unit: {
    type: String,
    default: 'pcs',
    trim: true
  },
  weight: {
    type: Number,
    min: 0,
    default: 0
  },
  dimensions: {
    length: { type: Number, min: 0, default: 0 },
    width: { type: Number, min: 0, default: 0 },
    height: { type: Number, min: 0, default: 0 }
  },
  
  // SUPPLIER INFORMATION
  supplierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier'
  },
  preferredSupplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier'
  },
  
  // BRANCH & ORGANIZATION
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true
  },
  
  // SALES & ANALYTICS
  salesCount: {
    type: Number,
    default: 0
  },
  totalSold: {
    type: Number,
    default: 0
  },
  revenue: {
    type: Number,
    default: 0
  },
  
  // TAX & DISCOUNT
  taxRate: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  discountRate: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  
  // INVENTORY TRACKING
  lastPurchased: {
    type: Date
  },
  lastSold: {
    type: Date
  },
  reorderLevel: {
    type: Number,
    default: 5,
    min: 0
  },
  
  // ADDITIONAL METADATA
  tags: [{
    type: String,
    trim: true
  }],
  notes: {
    type: String,
    maxlength: [1000, 'Notes cannot exceed 1000 characters']
  }

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// INDEXES FOR PERFORMANCE
productSchema.index({ branch: 1, category: 1 });
productSchema.index({ branch: 1, name: 1 });
productSchema.index({ branch: 1, stock: 1 });
productSchema.index({ sku: 1 }, { sparse: true });
productSchema.index({ barcode: 1 }, { sparse: true });
productSchema.index({ supplierId: 1 });
productSchema.index({ branch: 1, isAvailable: 1 });
productSchema.index({ branch: 1, active: 1 });
productSchema.index({ branch: 1, createdAt: -1 });
productSchema.index({ 'tags': 1 }); // For tag-based searches

// VIRTUAL FIELDS
productSchema.virtual('profitMargin').get(function() {
  if (this.cost > 0 && this.price > this.cost) {
    return ((this.price - this.cost) / this.price) * 100;
  }
  return 0;
});

productSchema.virtual('profitAmount').get(function() {
  return this.price - this.cost;
});

productSchema.virtual('stockValue').get(function() {
  return this.stock * this.cost;
});

productSchema.virtual('isLowStock').get(function() {
  return this.stock <= this.reorderLevel;
});

productSchema.virtual('isOutOfStock').get(function() {
  return this.stock === 0;
});

// PRE-SAVE MIDDLEWARE to sync cost fields
productSchema.pre('save', function(next) {
  // Sync cost and costPrice fields
  if (this.isModified('cost') && this.cost !== this.costPrice) {
    this.costPrice = this.cost;
  }
  if (this.isModified('costPrice') && this.costPrice !== this.cost) {
    this.cost = this.costPrice;
  }
  
  // Auto-generate SKU if not provided
  if (!this.sku) {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 5);
    this.sku = `SKU-${timestamp}-${random}`.toUpperCase();
  }
  
  next();
});

// STATIC METHODS
productSchema.statics.findByCategory = function(category, branchId) {
  return this.find({ category, branch: branchId, active: true, isAvailable: true });
};

productSchema.statics.findLowStock = function(branchId) {
  return this.find({ 
    branch: branchId, 
    active: true,
    $expr: { $lte: ['$stock', '$reorderLevel'] }
  });
};

productSchema.statics.findBySupplier = function(supplierId, branchId) {
  return this.find({ 
    $or: [{ supplierId }, { preferredSupplier: supplierId }],
    branch: branchId,
    active: true 
  });
};

// INSTANCE METHODS
productSchema.methods.incrementSales = function(quantity, salePrice = null) {
  this.salesCount += quantity;
  this.totalSold += quantity;
  
  const actualPrice = salePrice || this.price;
  this.revenue += actualPrice * quantity;
  
  this.lastSold = new Date();
  return this.save();
};

productSchema.methods.updateStock = function(quantity, operation = 'add') {
  if (operation === 'add') {
    this.stock += quantity;
    this.lastPurchased = new Date();
  } else if (operation === 'subtract') {
    this.stock = Math.max(0, this.stock - quantity);
    this.lastSold = new Date();
  } else if (operation === 'set') {
    this.stock = quantity;
  }
  
  return this.save();
};

productSchema.methods.canSell = function(quantity) {
  return this.isAvailable && this.active && this.stock >= quantity;
};

productSchema.methods.getStockStatus = function() {
  if (this.stock === 0) return 'out-of-stock';
  if (this.stock <= this.reorderLevel) return 'low-stock';
  return 'in-stock';
};

// QUERY HELPERS
productSchema.query.available = function() {
  return this.where({ isAvailable: true, active: true });
};

productSchema.query.byBranch = function(branchId) {
  return this.where({ branch: branchId });
};

productSchema.query.active = function() {
  return this.where({ active: true });
};

productSchema.query.search = function(searchTerm) {
  if (!searchTerm) return this;
  
  const regex = new RegExp(searchTerm, 'i');
  return this.where({
    $or: [
      { name: regex },
      { description: regex },
      { sku: regex },
      { barcode: regex },
      { brand: regex },
      { category: regex },
      { tags: regex }
    ]
  });
};

// VALIDATION for unique SKU per branch
productSchema.path('sku').validate(async function(value) {
  if (!value) return true; // SKU is optional
  
  const product = await this.constructor.findOne({
    sku: value,
    branch: this.branch,
    _id: { $ne: this._id }
  });
  
  return !product;
}, 'SKU already exists in this branch');

export default mongoose.model('Product', productSchema);