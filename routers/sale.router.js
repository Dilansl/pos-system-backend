import { Router } from 'express';
import { body } from 'express-validator';
import authenticate from '../middleware/auth.middleware.js';
import { anyStaff, adminOrManager } from '../middleware/role.middleware.js';
import { pinLimiter } from '../middleware/rateLimit.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import SaleController from '../controllers/sale.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', adminOrManager, SaleController.getAll);

router.get('/summary', anyStaff, SaleController.getDailySummary);

router.get('/receipt/:seq', anyStaff, SaleController.getByReceiptSeq);

// Recent receipts for reprinting at the till (cashiers: only their own).
router.get('/recent', anyStaff, SaleController.getRecent);

router.post('/discount-approval', anyStaff, pinLimiter, [
  body('approverId').isUUID().withMessage('Pick a manager.'),
  body('pin').matches(/^\d{4,6}$/).withMessage('PIN must be 4 to 6 digits.'),
  body('idempotencyKey').isUUID().withMessage('Invalid idempotency key.'),
  body('percent').isFloat({ min: 0, max: 100 }).withMessage('Invalid discount percent.'),
  validate,
], SaleController.approveDiscount);

router.get('/:id', anyStaff, SaleController.getById);

router.post('/', anyStaff, [
  body('idempotencyKey')
    .isUUID()
    .withMessage('Invalid idempotency key.'),
  body('offlineRetry')
    .optional()
    .isBoolean()
    .withMessage('offlineRetry must be a boolean.'),
  body('items')
    .isArray({ min: 1 })
    .withMessage('Cart must have at least one item.'),
  body('items.*.variantId')
    .isUUID()
    .withMessage('Invalid variant ID.'),
  body('items.*.quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be at least 1.'),
  body('items.*.discountType')
    .optional({ nullable: true })
    .isIn(['percent', 'fixed'])
    .withMessage('Invalid discount type.'),
  body('items.*.discountValue')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Discount value must be a positive number.'),
  body('billDiscountType')
    .optional({ nullable: true })
    .isIn(['percent', 'fixed'])
    .withMessage('Invalid bill discount type.'),
  body('billDiscountValue')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Bill discount must be a positive number.'),
  body('discountReason')
    .optional({ nullable: true })
    .isString()
    .isLength({ max: 255 }),
  body('approvalToken')
    .optional({ nullable: true })
    .isString(),
  body('exchange')
    .optional({ nullable: true })
    .isObject(),
  body('exchange.originalSaleId')
    .if(body('exchange').exists({ values: 'null' }))
    .isUUID()
    .withMessage('Invalid original sale.'),
  body('exchange.items')
    .if(body('exchange').exists({ values: 'null' }))
    .isArray({ min: 1 })
    .withMessage('Pick at least one item to return.'),
  body('exchange.items.*.saleItemId')
    .isUUID()
    .withMessage('Invalid returned item.'),
  body('exchange.items.*.quantity')
    .isInt({ min: 1 })
    .withMessage('Return quantity must be at least 1.'),
  body('exchange.refundMethod')
    .optional({ nullable: true })
    .isIn(['cash', 'card'])
    .withMessage('Refund must be cash or card.'),
  // Empty when returned items fully cover the new ones (checked in the model).
  body('payments')
    .isArray()
    .withMessage('Payments must be a list.'),
  body('total')
    .isFloat({ min: 0 })
    .withMessage('Total must be a positive number.'),
  validate,
], SaleController.create);

router.patch('/:id/hold', anyStaff, SaleController.hold);

export default router;