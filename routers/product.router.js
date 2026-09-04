import { Router } from 'express';
import { body, query } from 'express-validator';
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
], ProductController.getAll);
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

const variantValidators = [
  body('barcode')
    .trim()
    .notEmpty()
    .withMessage('Batch code (barcode) is required.'),
  body('priceOverride')
    .isFloat({ min: 0 })
    .withMessage('Selling price must be a positive number.'),
  body('costPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Cost price must be a positive number.'),
  body('size').optional().isString(),
  body('color').optional().isString(),
  body('promoType')
    .optional({ nullable: true })
    .isIn(['percent', 'fixed'])
    .withMessage('Invalid promo type.'),
  body('promoValue')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Promo value must be a positive number.'),
];

router.post('/:id/variants', adminOnly, [
  ...variantValidators,
  body('initialStock')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Initial stock must be a non-negative integer.'),
  body('minQuantity')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Minimum quantity must be a non-negative integer.'),
  validate,
], ProductController.addVariant);
router.put('/variants/:variantId', adminOnly, [...variantValidators, validate], ProductController.updateVariant);
router.delete('/:id', adminOnly, ProductController.delete);

export default router;