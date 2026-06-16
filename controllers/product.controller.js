import ProductModel from '../models/product.model.js';

const ProductController = {

  getCategories: async (req, res, next) => {
    try {
      const categories = await ProductModel.findAllCategories();
      res.json({ success: true, data: categories });
    } catch (err) { next(err); }
  },

  createCategory: async (req, res, next) => {
    try {
      const category = await ProductModel.createCategory(req.body);
      res.status(201).json({ success: true, data: category });
    } catch (err) { next(err); }
  },

  getAll: async (req, res, next) => {
    try {
      const includeInactive = req.query.includeInactive === 'true';
      const products = await ProductModel.findAll({ includeInactive });
      res.json({ success: true, data: products });
    } catch (err) { next(err); }
  },

  getById: async (req, res, next) => {
    try {
      const product = await ProductModel.findById(req.params.id);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found.',
        });
      }
      res.json({ success: true, data: product });
    } catch (err) { next(err); }
  },

  getByBarcode: async (req, res, next) => {
    try {
      const product = await ProductModel.findByBarcode(req.params.barcode);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Barcode not found.',
        });
      }
      res.json({ success: true, data: product });
    } catch (err) { next(err); }
  },

  search: async (req, res, next) => {
    try {
      const { q } = req.query;
      // Empty query → return all active variants (for the "All Items" button)
      const term = (q && q.trim().length >= 1) ? q.trim() : '';
      const results = await ProductModel.search(term);
      res.json({ success: true, data: results });
    } catch (err) { next(err); }
  },

  create: async (req, res, next) => {
    try {
      const product = await ProductModel.create(req.body);
      res.status(201).json({
        success: true,
        data: product,
        message: 'Product created.',
      });
    } catch (err) { next(err); }
  },

  

  update: async (req, res, next) => {
    try {
      const product = await ProductModel.update(req.params.id, req.body);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found.',
        });
      }
      res.json({ success: true, data: product, message: 'Product updated.' });
    } catch (err) { next(err); }
  },

  addVariant: async (req, res, next) => {
    try {
      const variant = await ProductModel.addVariant(req.params.id, req.body);
      res.status(201).json({
        success: true,
        data: variant,
        message: 'Variant added.',
      });
    } catch (err) { next(err); }
  },

  updateVariant: async (req, res, next) => {
    try {
      const variant = await ProductModel.updateVariant(req.params.variantId, req.body);
      if (!variant) {
        return res.status(404).json({
          success: false,
          message: 'Batch (variant) not found.',
        });
      }
      res.json({ success: true, data: variant, message: 'Batch updated.' });
    } catch (err) { next(err); }
  },

  delete: async (req, res, next) => {
    try {
      const result = await ProductModel.delete(req.params.id);
      if (result.deactivated) {
        return res.json({
          success: true,
          message: 'Product has sales history, so it was deactivated instead of deleted.',
        });
      }
      res.json({ success: true, message: 'Product deleted.' });
    } catch (err) { next(err); }
  },

};

export default ProductController;