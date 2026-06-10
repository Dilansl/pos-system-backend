import { Router } from 'express';
import { body } from 'express-validator';
import authenticate from '../middleware/auth.middleware.js';
import { adminOrManager, anyStaff } from '../middleware/role.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import InventoryController from '../controllers/inventory.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', anyStaff, InventoryController.getAll);

router.get('/low-stock', anyStaff, InventoryController.getLowStock);

router.get('/:variantId/history', anyStaff, InventoryController.getHistory);

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
  body('minQuantity')
    .isInt({ min: 0 })
    .withMessage('Minimum quantity must be a positive number.'),
  validate,
], InventoryController.updateMinQuantity);

export default router;