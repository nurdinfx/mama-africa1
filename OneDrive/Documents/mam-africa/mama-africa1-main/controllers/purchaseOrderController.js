import mongoose from 'mongoose'
import PurchaseOrder from '../models/PurchaseOrder.js'
import Product from '../models/Product.js'

export const createPurchaseOrder = async (req, res) => {
  try {
    const { supplierId, items, expectedDelivery, notes } = req.body
    const userId = req.user._id
    const branchId = req.user.branch._id

    if (!supplierId || !Array.isArray(items) || items.length === 0 || !expectedDelivery) {
      return res.status(400).json({ success: false, message: 'supplierId, items and expectedDelivery are required' })
    }

    let subtotal = 0
    let taxTotal = 0
    let discountTotal = 0
    const validatedItems = []

    for (const item of items) {
      if (!item.productId || !item.orderedQty || !item.unitCost) {
        return res.status(400).json({ success: false, message: 'Each item requires productId, orderedQty and unitCost' })
      }

      const product = await Product.findOne({ _id: item.productId, branch: branchId })
      if (!product) {
        return res.status(404).json({ success: false, message: `Product not found: ${item.productId}` })
      }

      const base = item.orderedQty * item.unitCost
      const discount = base * ((item.discount || 0) / 100)
      const tax = (base - discount) * ((item.tax || 0) / 100)
      const total = base - discount + tax

      subtotal += base
      discountTotal += discount
      taxTotal += tax

      validatedItems.push({
        productId: item.productId,
        orderedQty: item.orderedQty,
        receivedQty: 0,
        unitCost: item.unitCost,
        total: Math.round(total * 100) / 100
      })
    }

    const grandTotal = subtotal - discountTotal + taxTotal

    const po = new PurchaseOrder({
      supplierId,
      items: validatedItems,
      expectedDelivery: new Date(expectedDelivery),
      status: 'pending',
      subtotal: Math.round(subtotal * 100) / 100,
      taxTotal: Math.round(taxTotal * 100) / 100,
      discountTotal: Math.round(discountTotal * 100) / 100,
      grandTotal: Math.round(grandTotal * 100) / 100,
      createdBy: userId,
      notes: notes || '',
      branch: branchId
    })

    await po.save()
    await po.populate([
      { path: 'supplierId', select: 'name contact' },
      { path: 'items.productId', select: 'name category' },
      { path: 'createdBy', select: 'name email' }
    ])

    res.status(201).json({ success: true, data: po, message: 'Purchase order created' })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Failed to create purchase order' })
  }
}

export const getPurchaseOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, supplierId, from, to } = req.query
    const filter = { branch: req.user.branch._id }
    if (status) filter.status = status
    if (supplierId) filter.supplierId = supplierId
    if (from || to) {
      filter.createdAt = {}
      if (from) filter.createdAt.$gte = new Date(from)
      if (to) filter.createdAt.$lte = new Date(to)
    }

    const purchaseOrders = await PurchaseOrder.find(filter)
      .populate('supplierId', 'name contact')
      .populate('items.productId', 'name category')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))

    const total = await PurchaseOrder.countDocuments(filter)

    res.json({
      success: true,
      data: {
        purchaseOrders,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      }
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Failed to fetch purchase orders' })
  }
}

export const approvePurchaseOrder = async (req, res) => {
  try {
    const { id } = req.params
    const po = await PurchaseOrder.findOne({ _id: id, branch: req.user.branch._id })
    if (!po) {
      return res.status(404).json({ success: false, message: 'Purchase order not found' })
    }
    po.status = 'approved'
    po.approvedBy = req.user._id
    po.approvedAt = new Date()
    await po.save()
    await po.populate([
      { path: 'supplierId', select: 'name contact' },
      { path: 'items.productId', select: 'name category' }
    ])
    res.json({ success: true, data: po, message: 'Purchase order approved' })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Failed to approve purchase order' })
  }
}
