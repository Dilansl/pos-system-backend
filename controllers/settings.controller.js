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

  // Cash-out limit + who can approve — for the Cash In/Out dialog.
  getCash: async (req, res, next) => {
    try {
      const [cashOutLimit, approvers] = await Promise.all([
        SettingsModel.getCashOutLimit(),
        SettingsModel.getApprovers(),
      ]);
      res.json({ success: true, data: { cashOutLimit, approvers } });
    } catch (err) { next(err); }
  },

  setCashOutLimit: async (req, res, next) => {
    try {
      const cashOutLimit = await SettingsModel.setCashOutLimit(Number(req.body.amount));
      res.json({ success: true, data: cashOutLimit, message: 'Cash-out limit saved.' });
    } catch (err) { next(err); }
  },

  getShop: async (req, res, next) => {
    try {
      res.json({ success: true, data: await SettingsModel.getShop() });
    } catch (err) { next(err); }
  },

  setShop: async (req, res, next) => {
    try {
      const pick = (k) => String(req.body[k] ?? '').trim();
      const shop = await SettingsModel.setShop({
        name: pick('name'),
        tagline: pick('tagline'),
        address: pick('address'),
        phone: pick('phone'),
        tin: pick('tin'),
        receiptFooter: pick('receiptFooter'),
      });
      res.json({ success: true, data: shop, message: 'Shop details saved.' });
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
