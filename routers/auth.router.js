import { Router } from 'express';
import { body } from 'express-validator';
import authenticate from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import AuthController from '../controllers/auth.controller.js';

const router = Router();

router.post('/login', [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Username is required.'),
  body('password')
    .notEmpty()
    .withMessage('Password is required.'),
  validate,
], AuthController.login);

router.get('/me', authenticate, AuthController.me);

export default router;