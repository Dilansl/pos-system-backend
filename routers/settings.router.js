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

router.get('/cash', anyStaff, SettingsController.getCash);

router.put('/cash-out-limit', adminOnly, [
  body('amount')
    .isFloat({ min: 0 })
    .withMessage('Limit must be zero or more.'),
  validate,
], SettingsController.setCashOutLimit);

router.get('/shop', anyStaff, SettingsController.getShop);

router.put('/shop', adminOnly, [
  body('name').isString().trim().isLength({ min: 1, max: 60 }).withMessage('Enter the shop name (up to 60 characters).'),
  body(['tagline', 'phone', 'tin'])
    .optional({ values: 'null' }).isString().trim().isLength({ max: 60 })
    .withMessage('Keep it under 60 characters.'),
  body(['address', 'receiptFooter'])
    .optional({ values: 'null' }).isString().trim().isLength({ max: 120 })
    .withMessage('Keep it under 120 characters.'),
  validate,
], SettingsController.setShop);

export default router;
