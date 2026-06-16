import { Router } from 'express';
import { body } from 'express-validator';
import authenticate from '../middleware/auth.middleware.js';
import { anyStaff } from '../middleware/role.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import SaleController from '../controllers/sale.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', anyStaff, SaleController.getAll);

router.get('/summary', anyStaff, SaleController.getDailySummary);

router.get('/receipt/:seq', anyStaff, SaleController.getByReceiptSeq);

router.get('/:id', anyStaff, SaleController.getById);

router.post('/', anyStaff, [
  body('items')
    .isArray({ min: 1 })
    .withMessage('Cart must have at least one item.'),
  body('items.*.variantId')
    .isUUID()
    .withMessage('Invalid variant ID.'),
  body('items.*.quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be at least 1.'),
  body('payments')
    .isArray({ min: 1 })
    .withMessage('At least one payment is required.'),
  body('total')
    .isFloat({ min: 0 })
    .withMessage('Total must be a positive number.'),
  validate,
], SaleController.create);

router.patch('/:id/hold', anyStaff, SaleController.hold);

export default router;