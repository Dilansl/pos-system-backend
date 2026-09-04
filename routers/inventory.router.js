import { Router } from 'express';
import { body, param, query } from 'express-validator';
import authenticate from '../middleware/auth.middleware.js';
import { adminOrManager, anyStaff } from '../middleware/role.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import InventoryController from '../controllers/inventory.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', anyStaff, [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be a positive integer.'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be between 1 and 100.'),
  query('search')
    .optional()
    .isString()
    .withMessage('search must be a string.'),
  validate,
], InventoryController.getAll);

router.get('/low-stock', anyStaff, InventoryController.getLowStock);

router.get('/:variantId/history', anyStaff, [
  param('variantId')
    .isUUID()
    .withMessage('Invalid variant ID.'),
  validate,
], InventoryController.getHistory);

router.post('/adjust', adminOrManager, [
  body('variantId')
    .isUUID()
    .withMessage('Invalid variant ID.'),
  body('quantityChange')
    .isInt()
    .withMessage('quantityChange must be a whole number.'),
  validate,
], InventoryController.adjust);

router.patch('/:variantId/min-quantity', adminOrManager, [
  param('variantId')
    .isUUID()
    .withMessage('Invalid variant ID.'),
  body('minQuantity')
    .isInt({ min: 0 })
    .withMessage('Minimum quantity must be a positive number.'),
  validate,
], InventoryController.updateMinQuantity);

export default router;