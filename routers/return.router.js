import { Router } from 'express';
import { body } from 'express-validator';
import authenticate from '../middleware/auth.middleware.js';
import { adminOrManager } from '../middleware/role.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import ReturnController from '../controllers/return.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', adminOrManager, ReturnController.getAll);

router.get('/:id', adminOrManager, ReturnController.getById);

router.post('/', adminOrManager, [
  body('originalSaleId')
    .isUUID()
    .withMessage('Invalid sale ID.'),
  body('refundAmount')
    .isFloat({ min: 0 })
    .withMessage('Refund amount must be a positive number.'),
  body('refundMethod')
    .isIn(['cash', 'card', 'store_credit'])
    .withMessage('Invalid refund method.'),
  body('items')
    .isArray({ min: 1 })
    .withMessage('At least one item is required.'),
  validate,
], ReturnController.create);

export default router;