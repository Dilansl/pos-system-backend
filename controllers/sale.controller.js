import SaleModel from '../models/sale.model.js';

const SaleController = {

  create: async (req, res, next) => {
    try {
      const sale = await SaleModel.create({
        ...req.body,
        userId: req.user.id,
      });
      res.status(201).json({
        success: true,
        data: sale,
        message: 'Sale completed.',
      });
    } catch (err) { next(err); }
  },

  getById: async (req, res, next) => {
    try {
      const sale = await SaleModel.findById(req.params.id);
      if (!sale) {
        return res.status(404).json({
          success: false,
          message: 'Sale not found.',
        });
      }
      res.json({ success: true, data: sale });
    } catch (err) { next(err); }
  },

  getAll: async (req, res, next) => {
    try {
      const { startDate, endDate, userId, status, limit, offset } = req.query;
      const sales = await SaleModel.findAll({
        startDate,
        endDate,
        userId,
        status,
        limit: Number(limit) || 50,
        offset: Number(offset) || 0,
      });
      res.json({ success: true, data: sales });
    } catch (err) { next(err); }
  },

  getDailySummary: async (req, res, next) => {
    try {
      const date = req.query.date || new Date().toISOString().split('T')[0];
      const summary = await SaleModel.getDailySummary(date);
      res.json({ success: true, data: summary });
    } catch (err) { next(err); }
  },

  hold: async (req, res, next) => {
    try {
      const sale = await SaleModel.updateStatus(req.params.id, 'held');
      if (!sale) {
        return res.status(404).json({
          success: false,
          message: 'Sale not found.',
        });
      }
      res.json({ success: true, data: sale, message: 'Sale held.' });
    } catch (err) { next(err); }
  },

};

export default SaleController;