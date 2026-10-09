import SettingsModel from '../models/settings.model.js';

const SettingsController = {

  // Limits + who can approve — the POS needs both to decide when to ask
  // for a manager PIN.
  getDiscount: async (req, res, next) => {
    try {
      const [limits, approvers] = await Promise.all([
        SettingsModel.getDiscountLimits(),
        SettingsModel.getApprovers(),
      ]);
      res.json({ success: true, data: { limits, approvers } });
    } catch (err) { next(err); }
  },

  setDiscountLimits: async (req, res, next) => {
    try {
      const { cashier, manager, admin } = req.body;
      const limits = await SettingsModel.setDiscountLimits({
        cashier: Number(cashier),
        manager: Number(manager),
        admin: Number(admin),
      });
      res.json({ success: true, data: limits, message: 'Discount limits saved.' });
    } catch (err) { next(err); }
  },

};

export default SettingsController;
