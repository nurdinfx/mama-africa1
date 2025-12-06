import Supplier from '../models/Supplier.js';

export const createSupplier = async (req, res) => {
  try {
    const supplier = new Supplier(req.body);
    await supplier.save();

    res.status(201).json({
      success: true,
      data: supplier,
      message: 'Supplier created successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

export const getSuppliers = async (req, res) => {
  try {
    const { page = 1, limit = 10, search } = req.query;
    
    const filter = { active: true };
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { 'contact.email': { $regex: search, $options: 'i' } },
        { 'contact.phone': { $regex: search, $options: 'i' } }
      ];
    }

    const suppliers = await Supplier.find(filter)
      .sort({ name: 1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await Supplier.countDocuments(filter);

    res.json({
      success: true,
      data: {
        suppliers,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};