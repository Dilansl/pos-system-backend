import ReturnModel from '../models/return.model.js';
import ShiftModel from '../models/shift.model.js';
import { signApproval, verifyApproval, checkApproverPin } from '../utils/approval.js';

const ReturnController = {

  create: async (req, res, next) => {
    try {
      const { originalSaleId, refundMethod, reason, items, refundApprovalToken } = req.body;

      // Refunds are tied to the open shift so cash refunds come out of that
      // drawer's expected total. Cashiers must have one; managers/admins
      // doing a back-office return may not.
      const shift = await ShiftModel.findOpenByUser(req.user.id);
      if (!shift && req.user.role === 'cashier') {
        return res.status(400).json({
          success: false,
          message: 'No open shift. Please open a shift before giving a refund.',
        });
      }

      let approval = null;
      if (refundApprovalToken) {
        const decoded = verifyApproval('refund', refundApprovalToken);
        if (decoded && decoded.cashierId === req.user.id && decoded.originalSaleId === originalSaleId) {
          approval = decoded;
        }
      }

      const ret = await ReturnModel.create({
        originalSaleId,
        refundMethod,
        reason,
        items,
        userId: req.user.id,
        shiftId: shift?.id || null,
        needsApproval: req.user.role === 'cashier' && refundMethod === 'cash',
        approval,
      });
      res.status(201).json({
        success: true,
        data: ret,
        message: 'Return processed.',
      });
    } catch (err) { next(err); }
  },

  // Manager/admin PIN at the till for a cashier's cash refund on one bill.
  approveRefund: async (req, res, next) => {
    try {
      const { approverId, pin, originalSaleId, amount } = req.body;
      const approver = await checkApproverPin(approverId, pin);
      if (!approver) {
        return res.status(403).json({ success: false, message: 'Wrong PIN.' });
      }
      const token = signApproval('refund', {
        approverId: approver.id,
        cashierId: req.user.id,
        originalSaleId,
        maxAmount: Number(amount),
      }, '30m');
      res.json({ success: true, data: { token, approverName: approver.name } });
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
