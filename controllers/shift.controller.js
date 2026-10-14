import ShiftModel from '../models/shift.model.js';
import SettingsModel from '../models/settings.model.js';
import { checkApproverPin } from '../utils/approval.js';

const ShiftController = {

  // Get the logged-in cashier's current open shift (or null)
  getCurrent: async (req, res, next) => {
    try {
      const shift = await ShiftModel.findOpenByUser(req.user.id);
      if (!shift) return res.json({ success: true, data: null });
      const [movements, totals] = await Promise.all([
        ShiftModel.getCashMovements(shift.id),
        ShiftModel.getCashTotals(shift.id),
      ]);
      res.json({ success: true, data: { ...shift, ...totals, cash_movements: movements } });
    } catch (err) { next(err); }
  },

  // Petty cash in/out on the user's open shift. A cashier taking out more
  // than the limit in settings needs a manager/admin PIN.
  addCashMovement: async (req, res, next) => {
    try {
      const open = await ShiftModel.findOpenByUser(req.user.id);
      if (!open) {
        return res.status(400).json({
          success: false,
          message: 'Open a shift first.',
        });
      }

      const { type, reason, approverId, pin } = req.body;
      const amount = Number(req.body.amount);
      let approvedBy = null;

      if (type === 'out' && req.user.role === 'cashier') {
        const limit = await SettingsModel.getCashOutLimit();
        if (amount > limit + 0.001) {
          if (!approverId || !pin) {
            return res.status(403).json({
              success: false,
              code: 'CASH_OUT_APPROVAL_REQUIRED',
              message: `Taking out more than Rs. ${limit.toLocaleString()} needs manager approval.`,
            });
          }
          const approver = await checkApproverPin(approverId, pin);
          if (!approver) {
            return res.status(403).json({ success: false, message: 'Wrong PIN.' });
          }
          approvedBy = approver.id;
        }
      }

      const movement = await ShiftModel.addCashMovement({
        shiftId: open.id,
        userId: req.user.id,
        type,
        amount,
        reason: reason.trim(),
        approvedBy,
      });
      res.status(201).json({
        success: true,
        data: movement,
        message: type === 'in' ? 'Cash in recorded.' : 'Cash out recorded.',
      });
    } catch (err) { next(err); }
  },

  // Open a new shift
  open: async (req, res, next) => {
    try {
      // Prevent opening a second shift while one is already open
      const existing = await ShiftModel.findOpenByUser(req.user.id);
      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'You already have an open shift. Close it before opening a new one.',
        });
      }

      const { openingCash, notes } = req.body;
      const shift = await ShiftModel.open({
        userId: req.user.id,
        openingCash: Number(openingCash),
        notes,
      });
      res.status(201).json({ success: true, data: shift, message: 'Shift opened.' });
    } catch (err) { next(err); }
  },

  // Close the current shift
  close: async (req, res, next) => {
    try {
      const open = await ShiftModel.findOpenByUser(req.user.id);
      if (!open) {
        return res.status(400).json({
          success: false,
          message: 'No open shift to close.',
        });
      }

      const { closingCash, notes } = req.body;
      const closed = await ShiftModel.close(open.id, {
        closingCash: Number(closingCash),
        notes,
      });
      res.json({ success: true, data: closed, message: 'Shift closed.' });
    } catch (err) { next(err); }
  },

  // Get a shift's full detail/summary
  getById: async (req, res, next) => {
    try {
      const shift = await ShiftModel.findById(req.params.id);
      if (!shift) {
        return res.status(404).json({ success: false, message: 'Shift not found.' });
      }
      res.json({ success: true, data: shift });
    } catch (err) { next(err); }
  },
};

export default ShiftController;