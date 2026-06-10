import { Router } from 'express';
import { body } from 'express-validator';
import authenticate from '../middleware/auth.middleware.js';
import { adminOnly, anyStaff } from '../middleware/role.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import ProductController from '../controllers/product.controller.js';

const router = Router();

router.use(authenticate);

// Categories
router.get('/categories', anyStaff, ProductController.getCategories);
router.post('/categories', adminOnly, [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Category name is required.'),
  validate,
], ProductController.createCategory);

// Search and barcode — must be before /:id
router.get('/search', anyStaff, ProductController.search);
router.get('/barcode/:barcode', anyStaff, ProductController.getByBarcode);

// Products CRUD
router.get('/', anyStaff, ProductController.getAll);
router.get('/:id', anyStaff, ProductController.getById);

router.post('/', adminOnly, [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Product name is required.'),
  body('basePrice')
    .isFloat({ min: 0 })
    .withMessage('Base price must be a positive number.'),
  validate,
], ProductController.create);

router.put('/:id', adminOnly, [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Product name is required.'),
  body('basePrice')
    .isFloat({ min: 0 })
    .withMessage('Base price must be a positive number.'),
  validate,
], ProductController.update);

router.post('/:id/variants', adminOnly, ProductController.addVariant);

export default router;