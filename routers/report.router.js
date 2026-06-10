import { Router } from 'express';
import authenticate from '../middleware/auth.middleware.js';
import { adminOrManager } from '../middleware/role.middleware.js';
import ReportController from '../controllers/report.controller.js';

const router = Router();

router.use(authenticate, adminOrManager);

router.get('/summary', ReportController.getSummary);

router.get('/by-day', ReportController.getByDay);

router.get('/best-sellers', ReportController.getBestSellers);

router.get('/by-staff', ReportController.getByStaff);

router.get('/payments', ReportController.getPaymentBreakdown);

export default router;