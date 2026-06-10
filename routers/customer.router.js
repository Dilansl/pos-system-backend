import { Router } from 'express';
import { body } from 'express-validator';
import authenticate from '../middleware/auth.middleware.js';
import { anyStaff } from '../middleware/role.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import CustomerController from '../controllers/customer.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', anyStaff, CustomerController.getAll);

router.get('/phone/:phone', anyStaff, CustomerController.lookupByPhone);

router.get('/:id', anyStaff, CustomerController.getById);

router.post('/', anyStaff, [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Customer name is required.'),
  body('phone')
    .optional()
    .isMobilePhone()
    .withMessage('Invalid phone number.'),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Invalid email address.'),
  validate,
], CustomerController.create);

router.put('/:id', anyStaff, [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Customer name is required.'),
  body('phone')
    .optional()
    .isMobilePhone()
    .withMessage('Invalid phone number.'),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Invalid email address.'),
  validate,
], CustomerController.update);

export default router;