import SaleModel from '../models/sale.model.js';
import ShiftModel from '../models/shift.model.js';
import SettingsModel from '../models/settings.model.js';
import { signApproval, verifyApproval, checkApproverPin } from '../utils/approval.js';

const SaleController = {

  create: async (req, res, next) => {
    try {
      // A sale requires an open shift for this cashier
      const shift = await ShiftModel.findOpenByUser(req.user.id);
      if (!shift) {
        return res.status(400).json({
          success: false,
          message: 'No open shift. Please open a shift before making a sale.',
        });
      }

      const limits = await SettingsModel.getDiscountLimits();
      const discountLimit = Number(limits[req.user.role] ?? 0);

      // An approval only counts for the cashier and checkout it was issued for.
      let approval = null;
      if (req.body.approvalToken) {
        const decoded = verifyApproval('discount', req.body.approvalToken);
        if (decoded
            && decoded.cashierId === req.user.id
            && decoded.idempotencyKey === req.body.idempotencyKey) {
          approval = decoded;
        }
      }

      // Exchange where the shop pays money back: a cashier's cash refund needs
      // a manager's approval for that original bill.
      let refundApproval = null;
      if (req.body.exchange?.refundApprovalToken) {
        const decoded = verifyApproval('refund', req.body.exchange.refundApprovalToken);
        if (decoded
            && decoded.cashierId === req.user.id
            && decoded.originalSaleId === req.body.exchange.originalSaleId) {
          refundApproval = decoded;
        }
      }

      const sale = await SaleModel.create({
        ...req.body,
        userId: req.user.id,
        userRole: req.user.role,
        shiftId: shift.id,
        discountLimit,
        approval,
        refundApproval,
      });
      res.status(201).json({
        success: true,
        data: sale,
        message: 'Sale completed.',
      });
    } catch (err) { next(err); }
  },

  // Manager/admin enters their PIN at the till to approve an over-limit
  // discount. Returns a token the checkout then carries.
  approveDiscount: async (req, res, next) => {
    try {
      const { approverId, pin, idempotencyKey, percent } = req.body;
      const approver = await checkApproverPin(approverId, pin);
      if (!approver) {
        return res.status(403).json({ success: false, message: 'Wrong PIN.' });
      }

      const limits = await SettingsModel.getDiscountLimits();
      const approverLimit = Number(limits[approver.role] ?? 0);
      if (Number(percent) > approverLimit + 0.01) {
        return res.status(403).json({
          success: false,
          message: `${approver.name} can approve up to ${approverLimit}% only.`,
        });
      }

      const token = signApproval('discount', {
        approverId: approver.id,
        cashierId: req.user.id,
        idempotencyKey,
        maxPercent: Number(percent),
      });
      res.json({ success: true, data: { token, approverName: approver.name } });
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

  getByReceiptSeq: async (req, res, next) => {
    try {
      const sale = await SaleModel.findByReceiptSeq(req.params.seq);
      if (!sale) {
        return res.status(404).json({
          success: false,
          message: 'Sale not found.',
        });
      }
      res.json({ success: true, data: sale });
    } catch (err) { next(err); }
  },

  getRecent: async (req, res, next) => {
    try {
      const sales = await SaleModel.findAll({
        userId: req.user.role === 'cashier' ? req.user.id : undefined,
        status: 'completed',
        limit: 30,
      });
      res.json({ success: true, data: sales });
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