import { Router } from 'express';
import { body } from 'express-validator';
import authenticate from '../middleware/auth.middleware.js';
import { anyStaff } from '../middleware/role.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { pinLimiter } from '../middleware/rateLimit.middleware.js';
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

// Petty cash in/out during the shift (manager PIN above the cashier limit).
// Only attempts that carry a PIN count toward the PIN rate limit.
const pinLimiterIfPin = (req, res, next) => (req.body?.pin ? pinLimiter(req, res, next) : next());

router.post('/cash-movement', anyStaff, pinLimiterIfPin, [
  body('type').isIn(['in', 'out']).withMessage('Type must be in or out.'),
  body('amount').isFloat({ gt: 0 }).withMessage('Amount must be more than zero.'),
  body('reason').isString().trim().isLength({ min: 1, max: 255 }).withMessage('Enter a reason.'),
  body('approverId').optional({ values: 'falsy' }).isUUID().withMessage('Pick a manager.'),
  body('pin').optional({ values: 'falsy' }).matches(/^\d{4,6}$/).withMessage('PIN must be 4 to 6 digits.'),
  validate,
], ShiftController.addCashMovement);

router.get('/:id', anyStaff, ShiftController.getById);

export default router;