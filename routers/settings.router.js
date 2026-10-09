import { Router } from 'express';
import { body } from 'express-validator';
import authenticate from '../middleware/auth.middleware.js';
import { anyStaff, adminOnly } from '../middleware/role.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import SettingsController from '../controllers/settings.controller.js';

const router = Router();

router.use(authenticate);

router.get('/discount', anyStaff, SettingsController.getDiscount);

router.put('/discount-limits', adminOnly, [
  body(['cashier', 'manager', 'admin'])
    .isFloat({ min: 0, max: 100 })
    .withMessage('Each limit must be between 0 and 100.'),
  validate,
], SettingsController.setDiscountLimits);

export default router;
