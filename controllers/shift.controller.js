import ShiftModel from '../models/shift.model.js';

const ShiftController = {

  // Get the logged-in cashier's current open shift (or null)
  getCurrent: async (req, res, next) => {
    try {
      const shift = await ShiftModel.findOpenByUser(req.user.id);
      res.json({ success: true, data: shift });
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
        openingCash: Number(openingCash) || 0,
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
        closingCash: Number(closingCash) || 0,
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