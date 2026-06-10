import InventoryModel from '../models/inventory.model.js';

const InventoryController = {

  getAll: async (req, res, next) => {
    try {
      const stock = await InventoryModel.findAll();
      res.json({ success: true, data: stock });
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