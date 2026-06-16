import { query, getClient } from '../config/db.js';

const ReturnModel = {

  create: async ({ originalSaleId, userId, refundAmount, refundMethod, reason, items }) => {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // 1. Insert return header
      const { rows: [ret] } = await client.query(
        `INSERT INTO returns (original_sale_id, user_id, refund_amount, refund_method, reason)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [originalSaleId, userId, refundAmount, refundMethod, reason]
      );

      // 2. Insert return items + re-add stock
      for (const item of items) {
        // ── Guard against double-refunding ──
        // How many of this sale_item were sold?
        const { rows: [saleItem] } = await client.query(
          'SELECT variant_id, quantity FROM sale_items WHERE id = $1',
          [item.saleItemId]
        );
        if (!saleItem) throw new Error('Sale item not found.');

        // How many were already returned in previous returns?
        const { rows: [{ already_returned }] } = await client.query(
          `SELECT COALESCE(SUM(quantity), 0)::int AS already_returned
           FROM return_items WHERE sale_item_id = $1`,
          [item.saleItemId]
        );

        const remaining = saleItem.quantity - already_returned;
        if (item.quantity > remaining) {
          throw new Error(
            `Cannot return ${item.quantity} — only ${remaining} left to return for this item.`
          );
        }

        // Insert the return line
        await client.query(
          `INSERT INTO return_items (return_id, sale_item_id, quantity, refund_amount)
           VALUES ($1,$2,$3,$4)`,
          [ret.id, item.saleItemId, item.quantity, item.refundAmount]
        );

        // Lock and read current stock
        const { rows: [stock] } = await client.query(
          'SELECT * FROM stock WHERE variant_id = $1 FOR UPDATE',
          [saleItem.variant_id]
        );

        const newQty = stock.quantity + item.quantity;

        // Re-add stock
        await client.query(
          `UPDATE stock SET quantity = $1, updated_at = NOW() WHERE variant_id = $2`,
          [newQty, saleItem.variant_id]
        );

        // Log stock change
        await client.query(
          `INSERT INTO stock_logs
             (variant_id, user_id, change_type, quantity_before, quantity_change, quantity_after, note)
           VALUES ($1,$2,'return',$3,$4,$5,$6)`,
          [saleItem.variant_id, userId, stock.quantity, item.quantity, newQty,
           `Return for sale #${originalSaleId.slice(0, 8)}`]
        );
      }

      // 3. Decide new sale status: fully refunded vs partially refunded
      // Compare total sold qty vs total returned qty across the whole sale
      const { rows: [{ total_sold }] } = await client.query(
        `SELECT COALESCE(SUM(quantity), 0)::int AS total_sold
         FROM sale_items WHERE sale_id = $1`,
        [originalSaleId]
      );
      const { rows: [{ total_returned }] } = await client.query(
        `SELECT COALESCE(SUM(ri.quantity), 0)::int AS total_returned
         FROM return_items ri
         JOIN sale_items si ON ri.sale_item_id = si.id
         WHERE si.sale_id = $1`,
        [originalSaleId]
      );

      const newStatus = total_returned >= total_sold ? 'refunded' : 'partially_refunded';

      await client.query(
        `UPDATE sales SET status = $1 WHERE id = $2`,
        [newStatus, originalSaleId]
      );

      await client.query('COMMIT');
      return ret;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  findById: async (id) => {
    const { rows: [ret] } = await query(
      'SELECT * FROM returns WHERE id = $1',
      [id]
    );
    if (!ret) return null;

    const { rows: items } = await query(
      `SELECT ri.*, si.unit_price, pv.size, pv.color, p.name AS product_name
       FROM return_items ri
       JOIN sale_items si ON ri.sale_item_id = si.id
       JOIN product_variants pv ON si.variant_id = pv.id
       JOIN products p ON pv.product_id = p.id
       WHERE ri.return_id = $1`,
      [id]
    );
    return { ...ret, items };
  },

  findAll: async () => {
    const { rows } = await query(
      `SELECT r.*, u.name AS staff_name, s.total AS original_total
       FROM returns r
       JOIN users u ON r.user_id = u.id
       JOIN sales s ON r.original_sale_id = s.id
       ORDER BY r.created_at DESC`
    );
    return rows;
  },
};

export default ReturnModel;