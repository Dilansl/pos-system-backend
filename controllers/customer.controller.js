import CustomerModel from '../models/customer.model.js';

const CustomerController = {

  getAll: async (req, res, next) => {
    try {
      const customers = await CustomerModel.findAll();
      res.json({ success: true, data: customers });
    } catch (err) { next(err); }
  },

  getById: async (req, res, next) => {
    try {
      const customer = await CustomerModel.findById(req.params.id);
      if (!customer) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found.',
        });
      }
      res.json({ success: true, data: customer });
    } catch (err) { next(err); }
  },

  lookupByPhone: async (req, res, next) => {
    try {
      const customer = await CustomerModel.findByPhone(req.params.phone);
      if (!customer) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found.',
        });
      }
      res.json({ success: true, data: customer });
    } catch (err) { next(err); }
  },

  create: async (req, res, next) => {
    try {
      const customer = await CustomerModel.create(req.body);
      res.status(201).json({
        success: true,
        data: customer,
        message: 'Customer created.',
      });
    } catch (err) { next(err); }
  },

  update: async (req, res, next) => {
    try {
      const customer = await CustomerModel.update(req.params.id, req.body);
      if (!customer) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found.',
        });
      }
      res.json({ success: true, data: customer, message: 'Customer updated.' });
    } catch (err) { next(err); }
  },

};

export default CustomerController;