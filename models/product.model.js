import { query, getClient } from '../config/db.js';

const ProductModel = {

  findAllCategories: async () => {
    const { rows } = await query(
      'SELECT * FROM categories ORDER BY name ASC'
    );
    return rows;
  },

  createCategory: async ({ name, description }) => {
    const { rows } = await query(
      `INSERT INTO categories (name, description) VALUES ($1, $2) RETURNING *`,
      [name, description]
    );
    return rows[0];
  },

  findAll: async ({ includeInactive = false } = {}) => {
    const { rows } = await query(
      `SELECT p.*, c.name AS category_name,
              COUNT(pv.id)::int AS variant_count
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN product_variants pv ON pv.product_id = p.id
       ${includeInactive ? '' : 'WHERE p.is_active = true'}
       GROUP BY p.id, c.name
       ORDER BY p.name ASC`
    );
    return rows;
  },

  findById: async (id) => {
    const { rows: [product] } = await query(
      `SELECT p.*, c.name AS category_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.id = $1`,
      [id]
    );
    if (!product) return null;

    const { rows: variants } = await query(
      `SELECT pv.*, s.quantity, s.min_quantity
       FROM product_variants pv
       LEFT JOIN stock s ON s.variant_id = pv.id
       WHERE pv.product_id = $1
       ORDER BY pv.size, pv.color`,
      [id]
    );

    return { ...product, variants };
  },

  findByBarcode: async (barcode) => {
    const { rows } = await query(
      `SELECT pv.*, p.name AS product_name, p.base_price,
              COALESCE(pv.price_override, p.base_price) AS sell_price,
              c.name AS category_name,
              s.quantity AS stock_quantity
       FROM product_variants pv
       JOIN products p ON pv.product_id = p.id
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN stock s ON s.variant_id = pv.id
       WHERE pv.barcode = $1 AND p.is_active = true`,
      [barcode]
    );
    return rows[0] || null;
  },

  search: async (term) => {
    const { rows } = await query(
      `SELECT pv.*, p.name AS product_name, p.base_price,
              COALESCE(pv.price_override, p.base_price) AS sell_price,
              c.name AS category_name,
              s.quantity AS stock_quantity
       FROM product_variants pv
       JOIN products p ON pv.product_id = p.id
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN stock s ON s.variant_id = pv.id
       WHERE p.is_active = true
         AND (
           p.name    ILIKE $1 OR
           c.name    ILIKE $1 OR
           pv.size   ILIKE $1 OR
           pv.color  ILIKE $1 OR
           pv.barcode ILIKE $1
         )
       ORDER BY p.name ASC`,
      [`%${term}%`]
    );
    return rows;
  },

  create: async ({ categoryId, name, description, basePrice, variants = [] }) => {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const { rows: [product] } = await client.query(
        `INSERT INTO products (category_id, name, description, base_price)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [categoryId, name, description, basePrice]
      );

      const createdVariants = [];
      for (const v of variants) {
        const { rows: [variant] } = await client.query(
          `INSERT INTO product_variants (product_id, size, color, barcode, price_override)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [product.id, v.size, v.color, v.barcode, v.priceOverride || null]
        );

        await client.query(
          `INSERT INTO stock (variant_id, quantity, min_quantity)
           VALUES ($1, $2, $3)`,
          [variant.id, v.initialStock || 0, v.minQuantity || 5]
        );

        createdVariants.push(variant);
      }

      await client.query('COMMIT');
      return { ...product, variants: createdVariants };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  update: async (id, { categoryId, name, description, basePrice, isActive }) => {
    const { rows } = await query(
      `UPDATE products
       SET category_id = $1, name = $2, description = $3,
           base_price = $4, is_active = $5, updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [categoryId, name, description, basePrice, isActive, id]
    );
    return rows[0] || null;
  },

  addVariant: async (productId, { size, color, barcode, priceOverride, initialStock = 0, minQuantity = 5 }) => {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const { rows: [variant] } = await client.query(
        `INSERT INTO product_variants (product_id, size, color, barcode, price_override)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [productId, size, color, barcode, priceOverride || null]
      );

      await client.query(
        `INSERT INTO stock (variant_id, quantity, min_quantity) VALUES ($1, $2, $3)`,
        [variant.id, initialStock, minQuantity]
      );

      await client.query('COMMIT');
      return variant;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};

export default ProductModel;