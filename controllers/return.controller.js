import ReturnModel from '../models/return.model.js';

const ReturnController = {

  create: async (req, res, next) => {
    try {
      const ret = await ReturnModel.create({
        ...req.body,
        userId: req.user.id,
      });
      res.status(201).json({
        success: true,
        data: ret,
        message: 'Return processed.',
      });
    } catch (err) { next(err); }
  },

  getById: async (req, res, next) => {
    try {
      const ret = await ReturnModel.findById(req.params.id);
      if (!ret) {
        return res.status(404).json({
          success: false,
          message: 'Return not found.',
        });
      }
      res.json({ success: true, data: ret });
    } catch (err) { next(err); }
  },

  getAll: async (req, res, next) => {
    try {
      const returns = await ReturnModel.findAll();
      res.json({ success: true, data: returns });
    } catch (err) { next(err); }
  },

};

export default ReturnController;