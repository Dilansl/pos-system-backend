import { Router } from 'express';
import { body } from 'express-validator';
import authenticate from '../middleware/auth.middleware.js';
import { anyStaff } from '../middleware/role.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import ShiftController from '../controllers/shift.controller.js';

const router = Router();

router.use(authenticate);

router.get('/current', anyStaff, ShiftController.getCurrent);

router.post('/open', anyStaff, [
  body('openingCash')
    .isFloat({ min: 0 })
    .withMessage('Opening cash must be a non-negative number.'),
  validate,
], ShiftController.open);

router.post('/close', anyStaff, [
  body('closingCash')
    .isFloat({ min: 0 })
    .withMessage('Closing cash must be a non-negative number.'),
  validate,
], ShiftController.close);

router.get('/:id', anyStaff, ShiftController.getById);

export default router;