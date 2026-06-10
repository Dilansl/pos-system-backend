import { query, getClient } from '../config/db.js';

const InventoryModel = {

  findAll: async () => {
    const { rows } = await query(
      `SELECT s.*, pv.size, pv.color, pv.barcode,
              p.id AS product_id, p.name AS product_name,
              c.name AS category_name,
              (s.quantity <= s.min_quantity) AS is_low_stock
       FROM stock s
       JOIN product_variants pv ON s.variant_id = pv.id
       JOIN products p ON pv.product_id = p.id
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.is_active = true
       ORDER BY is_low_stock DESC, p.name ASC`
    );
    return rows;
  },

  findLowStock: async () => {
    const { rows } = await query(
      `SELECT s.*, pv.size, pv.color, pv.barcode, p.name AS product_name
       FROM stock s
       JOIN product_variants pv ON s.variant_id = pv.id
       JOIN products p ON pv.product_id = p.id
       WHERE s.quantity <= s.min_quantity AND p.is_active = true
       ORDER BY s.quantity ASC`
    );
    return rows;
  },

  adjust: async ({ variantId, userId, quantityChange, changeType = 'manual', note }) => {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const { rows: [stock] } = await client.query(
        'SELECT * FROM stock WHERE variant_id = $1 FOR UPDATE',
        [variantId]
      );

      if (!stock) throw new Error(`No stock record for variant ${variantId}`);

      const newQty = stock.quantity + quantityChange;
      if (newQty < 0) throw new Error('Stock cannot go below 0.');

      await client.query(
        `UPDATE stock SET quantity = $1, updated_at = NOW() WHERE variant_id = $2`,
        [newQty, variantId]
      );

      await client.query(
        `INSERT INTO stock_logs
           (variant_id, user_id, change_type, quantity_before, quantity_change, quantity_after, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [variantId, userId, changeType, stock.quantity, quantityChange, newQty, note]
      );

      await client.query('COMMIT');
      return { variantId, quantityBefore: stock.quantity, quantityChange, quantityAfter: newQty };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  getHistory: async (variantId, limit = 50) => {
    const { rows } = await query(
      `SELECT sl.*, u.name AS staff_name
       FROM stock_logs sl
       LEFT JOIN users u ON sl.user_id = u.id
       WHERE sl.variant_id = $1
       ORDER BY sl.created_at DESC
       LIMIT $2`,
      [variantId, limit]
    );
    return rows;
  },

  updateMinQuantity: async (variantId, minQuantity) => {
    const { rows } = await query(
      `UPDATE stock SET min_quantity = $1 WHERE variant_id = $2 RETURNING *`,
      [minQuantity, variantId]
    );
    return rows[0] || null;
  },
};

export default InventoryModel;