import Joi from 'joi';

export const validateLogin = (req, res, next) => {
  const schema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required()
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details[0].message
    });
  }
  next();
};

export const validateUser = (req, res, next) => {
  const schema = Joi.object({
    name: Joi.string().min(2).max(50).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    role: Joi.string().valid('admin', 'manager', 'cashier', 'chef', 'waiter').required(),
    phone: Joi.string().allow(''),
    address: Joi.string().allow(''),
    salary: Joi.number().min(0)
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details[0].message
    });
  }
  next();
};

export const validateProduct = (req, res, next) => {
  const schema = Joi.object({
    name: Joi.string().min(2).max(100).required(),
    description: Joi.string().allow(''),
    price: Joi.number().min(0).required(),
    cost: Joi.number().min(0).required(),
    category: Joi.string().required(),
    stock: Joi.number().min(0).default(0),
    isAvailable: Joi.boolean().default(true),
    image: Joi.string().allow('')
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details[0].message
    });
  }
  next();
};

export const validateOrder = (req, res, next) => {
  const schema = Joi.object({
    orderType: Joi.string().valid('dine-in', 'takeaway', 'delivery').required(),
    tableId: Joi.when('orderType', {
      is: 'dine-in',
      then: Joi.string().required(),
      otherwise: Joi.string().allow('')
    }),
    customerId: Joi.string().allow(''),
    customerName: Joi.string().allow(''),
    customerPhone: Joi.string().allow(''),
    items: Joi.array().items(
      Joi.object({
        product: Joi.string().required(),
        quantity: Joi.number().min(1).required(),
        notes: Joi.string().allow('')
      })
    ).min(1).required(),
    paymentMethod: Joi.string().valid('cash', 'card', 'mobile', 'credit').default('cash'),
    notes: Joi.string().allow('')
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details[0].message
    });
  }
  next();
};

export const validateCustomer = (req, res, next) => {
  const schema = Joi.object({
    name: Joi.string().min(2).max(50).required(),
    email: Joi.string().email().allow(''),
    phone: Joi.string().required(),
    address: Joi.string().allow(''),
    notes: Joi.string().allow('')
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details[0].message
    });
  }
  next();
};