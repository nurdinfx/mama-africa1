import express from 'express';
import auth from '../middleware/auth.js';
import Product from '../models/Product.js';
import Purchase from '../models/Purchase.js';

const router = express.Router();

// POST /sync
// Body: { operations: [ { method: 'POST'|'PUT'|'DELETE', url: '/products'|'/products/:id'|'/purchases'|..., body: {...} } ] }
router.post('/', auth, async (req, res) => {
  const ops = req.body.operations || [];
  const results = [];

  for (const op of ops) {
    const { method, url, body } = op;
    try {
      // Basic product operations
      if (url.startsWith('/products')) {
        if (method === 'POST') {
          const product = new Product({ ...body, branch: req.user.branch._id });
          await product.save();
          if (req.io) req.io.to(`branch-${req.user.branch._id}`).emit('product-created', product);
          results.push({ success: true, data: product });
          continue;
        }

        // /products/:id
        const idMatch = url.match(/^\/products\/(.+)$/);
        if (idMatch) {
          const id = idMatch[1];
          if (method === 'PUT') {
            const updated = await Product.findOneAndUpdate(
              { _id: id, branch: req.user.branch._id },
              body,
              { new: true, runValidators: true }
            );
            if (!updated) {
              results.push({ success: false, message: 'Product not found', code: 404 });
              continue;
            }
            if (req.io) req.io.to(`branch-${req.user.branch._id}`).emit('product-updated', updated);
            results.push({ success: true, data: updated });
            continue;
          }

          if (method === 'DELETE') {
            const deleted = await Product.findOneAndDelete({ _id: id, branch: req.user.branch._id });
            if (!deleted) {
              results.push({ success: false, message: 'Product not found', code: 404 });
              continue;
            }
            if (req.io) req.io.to(`branch-${req.user.branch._id}`).emit('product-deleted', deleted);
            results.push({ success: true });
            continue;
          }
        }
      }

      // Basic purchase operations
      if (url.startsWith('/purchases')) {
        if (method === 'POST') {
          const purchase = new Purchase({ ...body, branch: req.user.branch._id });
          await purchase.save();
          if (req.io) req.io.to(`branch-${req.user.branch._id}`).emit('purchase-created', purchase);
          results.push({ success: true, data: purchase });
          continue;
        }

        const idMatch = url.match(/^\/purchases\/(.+)$/);
        if (idMatch) {
          const id = idMatch[1];
          if (method === 'PUT') {
            const updated = await Purchase.findOneAndUpdate({ _id: id, branch: req.user.branch._id }, body, { new: true });
            if (!updated) {
              results.push({ success: false, message: 'Purchase not found', code: 404 });
              continue;
            }
            results.push({ success: true, data: updated });
            continue;
          }
          if (method === 'DELETE') {
            const deleted = await Purchase.findOneAndDelete({ _id: id, branch: req.user.branch._id });
            if (!deleted) {
              results.push({ success: false, message: 'Purchase not found', code: 404 });
              continue;
            }
            results.push({ success: true });
            continue;
          }
        }
      }

      // Unsupported operation
      results.push({ success: false, message: 'Unsupported operation', operation: op });
    } catch (error) {
      console.error('Sync operation failed:', error);
      results.push({ success: false, message: error.message || 'Operation failed' });
    }
  }

  res.json({ results });
});

export default router;
