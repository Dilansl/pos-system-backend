import InventoryModel from '../models/inventory.model.js';

const InventoryController = {

  getAll: async (req, res, next) => {
    try {
      let page = parseInt(req.query.page, 10);
      let limit = parseInt(req.query.limit, 10);
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

      if (!Number.isInteger(page) || page < 1) page = 1;
      if (!Number.isInteger(limit) || limit < 1) limit = 10;
      if (limit > 100) limit = 100;

      const result = await InventoryModel.findAll({ page, limit, search });

      res.json({
        success: true,
        data: result.items,
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      });
    } catch (err) { next(err); }
  },

  getLowStock: async (req, res, next) => {
    try {
      const items = await InventoryModel.findLowStock();
      res.json({ success: true, data: items });
    } catch (err) { next(err); }
  },

  adjust: async (req, res, next) => {
    try {
      const result = await InventoryModel.adjust({
        ...req.body,
        userId: req.user.id,
      });
      res.json({ success: true, data: result, message: 'Stock updated.' });
    } catch (err) { next(err); }
  },

  getHistory: async (req, res, next) => {
    try {
      const logs = await InventoryModel.getHistory(req.params.variantId);
      res.json({ success: true, data: logs });
    } catch (err) { next(err); }
  },

  updateMinQuantity: async (req, res, next) => {
    try {
      const { minQuantity } = req.body;
      const result = await InventoryModel.updateMinQuantity(
        req.params.variantId,
        minQuantity
      );
      if (!result) {
        return res.status(404).json({
          success: false,
          message: 'Stock record not found.',
        });
      }
      res.json({ success: true, data: result, message: 'Minimum quantity updated.' });
    } catch (err) { next(err); }
  },

};

export default InventoryController;