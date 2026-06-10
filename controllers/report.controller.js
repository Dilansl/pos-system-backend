import ReportModel from '../models/report.model.js';

const ReportController = {

  getSummary: async (req, res, next) => {
    try {
      const { startDate, endDate } = req.query;
      const data = await ReportModel.getSalesSummary({ startDate, endDate });
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },

  getByDay: async (req, res, next) => {
    try {
      const { startDate, endDate } = req.query;
      const data = await ReportModel.getSalesByDay({ startDate, endDate });
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },

  getBestSellers: async (req, res, next) => {
    try {
      const { startDate, endDate, limit } = req.query;
      const data = await ReportModel.getBestSellers({ startDate, endDate, limit });
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },

  getByStaff: async (req, res, next) => {
    try {
      const { startDate, endDate } = req.query;
      const data = await ReportModel.getSalesByStaff({ startDate, endDate });
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },

  getPaymentBreakdown: async (req, res, next) => {
    try {
      const { startDate, endDate } = req.query;
      const data = await ReportModel.getPaymentBreakdown({ startDate, endDate });
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },

};

export default ReportController;