import { Router } from 'express';
import { body } from 'express-validator';
import authenticate from '../middleware/auth.middleware.js';
import { adminOnly, adminOrManager } from '../middleware/role.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import StaffController from '../controllers/staff.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', adminOrManager, StaffController.getAll);

router.get('/:id', adminOrManager, StaffController.getById);

router.post('/', adminOnly, [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required.'),
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Username is required.'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters.'),
  body('role')
    .isIn(['admin', 'manager', 'cashier'])
    .withMessage('Invalid role.'),
  validate,
], StaffController.create);

router.put('/:id', adminOnly, [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required.'),
  body('role')
    .isIn(['admin', 'manager', 'cashier'])
    .withMessage('Invalid role.'),
  validate,
], StaffController.update);

router.patch('/:id/password', adminOnly, [
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters.'),
  validate,
], StaffController.resetPassword);

router.patch('/:id/status', adminOnly, [
  body('isActive')
    .isBoolean()
    .withMessage('isActive must be true or false.'),
  validate,
], StaffController.setActive);

export default router;