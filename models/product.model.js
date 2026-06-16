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
              p.promo_type AS product_promo_type, p.promo_value AS product_promo_value,
              pv.promo_type AS variant_promo_type, pv.promo_value AS variant_promo_value,
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
              p.promo_type AS product_promo_type, p.promo_value AS product_promo_value,
              pv.promo_type AS variant_promo_type, pv.promo_value AS variant_promo_value,
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

  create: async ({ categoryId, name, description, basePrice, promoType = null, promoValue = 0, variants = [] }) => {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const { rows: [product] } = await client.query(
        `INSERT INTO products (category_id, name, description, base_price, promo_type, promo_value)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [categoryId, name, description, basePrice, promoType, promoValue]
      );

      const createdVariants = [];
      for (const v of variants) {
        const { rows: [variant] } = await client.query(
        `INSERT INTO product_variants (product_id, size, color, barcode, price_override, cost_price)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [product.id, v.size, v.color, v.barcode || null, v.priceOverride || null, v.costPrice || 0]
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

  update: async (id, { categoryId, name, description, basePrice, isActive, promoType = null, promoValue = 0 }) => {
    const { rows } = await query(
      `UPDATE products
       SET category_id = $1, name = $2, description = $3,
           base_price = $4, is_active = $5,
           promo_type = $6, promo_value = $7, updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      [categoryId, name, description, basePrice, isActive, promoType, promoValue, id]
    );
    return rows[0] || null;
  },

 addVariant: async (productId, { size, color, barcode, priceOverride, costPrice = 0, promoType = null, promoValue = 0, initialStock = 0, minQuantity = 5 }) => {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const { rows: [variant] } = await client.query(
        `INSERT INTO product_variants (product_id, size, color, barcode, price_override, cost_price, promo_type, promo_value)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [productId, size, color, barcode || null, priceOverride || null, costPrice || 0, promoType, promoValue || 0]
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

  updateVariant: async (variantId, { size, color, barcode, priceOverride, costPrice, promoType = null, promoValue = 0 }) => {
    const { rows } = await query(
      `UPDATE product_variants
       SET size = $1, color = $2, barcode = $3,
           price_override = $4, cost_price = $5,
           promo_type = $6, promo_value = $7
       WHERE id = $8 RETURNING *`,
      [size, color, barcode || null, priceOverride || null, costPrice || 0, promoType, promoValue || 0, variantId]
    );
    return rows[0] || null;
  },

  delete: async (id) => {
    // Check if the product has any sales history
    const { rows: salesCheck } = await query(
      `SELECT COUNT(*)::int AS count
       FROM sale_items si
       JOIN product_variants pv ON si.variant_id = pv.id
       WHERE pv.product_id = $1`,
      [id]
    );

    if (salesCheck[0].count > 0) {
      // Has sales — soft delete (deactivate) to preserve history
      const { rows } = await query(
        `UPDATE products SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *`,
        [id]
      );
      return { deactivated: true, product: rows[0] };
    }

    // No sales — safe to hard delete (variants + stock cascade)
    await query('DELETE FROM products WHERE id = $1', [id]);
    return { deleted: true };
  },


};

export default ProductModel;