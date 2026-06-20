import { Router } from 'express';
import authenticate from '../middleware/auth.middleware.js';
import { anyStaff } from '../middleware/role.middleware.js';
import ShiftController from '../controllers/shift.controller.js';

const router = Router();

router.use(authenticate);

router.get('/current', anyStaff, ShiftController.getCurrent);
router.post('/open', anyStaff, ShiftController.open);
router.post('/close', anyStaff, ShiftController.close);
router.get('/:id', anyStaff, ShiftController.getById);

export default router;