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
      if (!q || q.trim().length < 1) {
        return res.status(400).json({
          success: false,
          message: 'Search term is required.',
        });
      }
      const results = await ProductModel.search(q.trim());
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

};

export default ProductController;