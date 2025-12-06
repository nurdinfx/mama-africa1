import Product from '../models/Product.js';

export const validatePurchaseItems = async (items) => {
  const validatedItems = [];
  const errors = [];

  for (const [index, item] of items.entries()) {
    try {
      // Validate product exists
      const product = await Product.findById(item.productId);
      if (!product) {
        errors.push(`Product with ID ${item.productId} not found`);
        continue;
      }

      if (item.qty <= 0) {
        errors.push('Quantity must be greater than 0');
      }

      if (item.unitCost <= 0) {
        errors.push('Unit cost must be greater than 0');
      }

      const itemTotal = (item.qty * item.unitCost) * 
                       (1 - (item.discount || 0) / 100) * 
                       (1 + (item.tax || 0) / 100);
      
      validatedItems.push({
        ...item,
        total: Math.round(itemTotal * 100) / 100
      });
    } catch (error) {
      errors.push(`Item ${index + 1}: ${error.message}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join(', '));
  }

  return validatedItems;
};

export const calculatePurchaseTotals = async (items) => {
  const validatedItems = await validatePurchaseItems(items);
  
  const subtotal = validatedItems.reduce((sum, item) => sum + (item.qty * item.unitCost), 0);
  const discountTotal = validatedItems.reduce((sum, item) => 
    sum + (item.qty * item.unitCost * (item.discount || 0) / 100), 0);
  const taxTotal = validatedItems.reduce((sum, item) => 
    sum + ((item.qty * item.unitCost * (1 - (item.discount || 0) / 100)) * (item.tax || 0) / 100), 0);
  const grandTotal = subtotal - discountTotal + taxTotal;

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    taxTotal: Math.round(taxTotal * 100) / 100,
    discountTotal: Math.round(discountTotal * 100) / 100,
    grandTotal: Math.round(grandTotal * 100) / 100,
    validatedItems
  };
};

export const updateInventory = async (items, session = null) => {
  const updateOperations = items.map(item => ({
    updateOne: {
      filter: { _id: item.productId },
      update: { $inc: { stock: item.qty } }
    }
  }));

  const options = session ? { session } : {};
  await Product.bulkWrite(updateOperations, options);
};