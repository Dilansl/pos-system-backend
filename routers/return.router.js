import { Router } from 'express';
import { body } from 'express-validator';
import authenticate from '../middleware/auth.middleware.js';
import { adminOrManager, anyStaff } from '../middleware/role.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { pinLimiter } from '../middleware/rateLimit.middleware.js';
import ReturnController from '../controllers/return.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', adminOrManager, ReturnController.getAll);

router.post('/refund-approval', anyStaff, pinLimiter, [
  body('approverId').isUUID().withMessage('Pick a manager.'),
  body('pin').matches(/^\d{4,6}$/).withMessage('PIN must be 4 to 6 digits.'),
  body('originalSaleId').isUUID().withMessage('Invalid sale ID.'),
  body('amount').isFloat({ min: 0 }).withMessage('Invalid refund amount.'),
  validate,
], ReturnController.approveRefund);

router.get('/:id', adminOrManager, ReturnController.getById);

// Cashiers can process returns from the POS; a cashier's cash refund needs
// a manager approval token (checked in the model once the amount is known).
// The refund amount is always computed server-side from what was paid.
router.post('/', anyStaff, [
  body('originalSaleId')
    .isUUID()
    .withMessage('Invalid sale ID.'),
  body('refundMethod')
    .isIn(['cash', 'card', 'store_credit'])
    .withMessage('Invalid refund method.'),
  body('reason')
    .optional({ nullable: true })
    .isString()
    .isLength({ max: 255 }),
  body('refundApprovalToken')
    .optional({ nullable: true })
    .isString(),
  body('items')
    .isArray({ min: 1 })
    .withMessage('At least one item is required.'),
  body('items.*.saleItemId')
    .isUUID()
    .withMessage('Invalid sale item ID.'),
  body('items.*.quantity')
    .isInt({ min: 1 })
    .withMessage('Return quantity must be at least 1.'),
  validate,
], ReturnController.create);

export default router;
