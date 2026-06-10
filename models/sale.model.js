import { query, getClient } from '../config/db.js';

const SaleModel = {

  create: async (saleData) => {
    const { shiftId, userId, customerId, subtotal, discountAmount,
            taxAmount, total, notes, items, payments } = saleData;

    const client = await getClient();
    try {
      await client.query('BEGIN');

      // 1. Insert sale header
      const { rows: [sale] } = await client.query(
        `INSERT INTO sales
           (shift_id, user_id, customer_id, subtotal, discount_amount,
            tax_amount, total, notes, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'completed')
         RETURNING *`,
        [shiftId, userId, customerId, subtotal, discountAmount, taxAmount, total, notes]
      );

      // 2. Insert line items + deduct stock
      for (const item of items) {
        await client.query(
          `INSERT INTO sale_items
             (sale_id, variant_id, quantity, unit_price, discount_amount, line_total)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [sale.id, item.variantId, item.quantity, item.unitPrice,
           item.discountAmount || 0, item.lineTotal]
        );

        // Lock stock row to prevent race conditions
        const { rows: [stock] } = await client.query(
          'SELECT * FROM stock WHERE variant_id = $1 FOR UPDATE',
          [item.variantId]
        );

        if (!stock) throw new Error(`No stock record for variant ${item.variantId}`);
        if (stock.quantity < item.quantity) {
          throw new Error(`Insufficient stock. Available: ${stock.quantity}`);
        }

        const newQty = stock.quantity - item.quantity;

        // Deduct stock
        await client.query(
          `UPDATE stock SET quantity = $1, updated_at = NOW() WHERE variant_id = $2`,
          [newQty, item.variantId]
        );

        // Log the stock change
        await client.query(
          `INSERT INTO stock_logs
             (variant_id, user_id, change_type, quantity_before, quantity_change, quantity_after, note)
           VALUES ($1,$2,'sale',$3,$4,$5,$6)`,
          [item.variantId, userId, stock.quantity, -item.quantity, newQty,
           `Sale #${sale.id.slice(0, 8)}`]
        );
      }

      // 3. Insert payments
      for (const payment of payments) {
        await client.query(
          `INSERT INTO payments (sale_id, method, amount, reference)
           VALUES ($1,$2,$3,$4)`,
          [sale.id, payment.method, payment.amount, payment.reference || null]
        );
      }

      // 4. Update customer loyalty points if customer attached
      if (customerId) {
        const pointsEarned = Math.floor(total / 100);
        await client.query(
          `UPDATE customers
           SET total_spent = total_spent + $1,
               loyalty_points = loyalty_points + $2
           WHERE id = $3`,
          [total, pointsEarned, customerId]
        );
      }

      await client.query('COMMIT');
      return sale;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  findById: async (id) => {
    const { rows: [sale] } = await query(
      `SELECT s.*,
              u.name AS cashier_name,
              c.name AS customer_name,
              c.phone AS customer_phone
       FROM sales s
       JOIN users u ON s.user_id = u.id
       LEFT JOIN customers c ON s.customer_id = c.id
       WHERE s.id = $1`,
      [id]
    );
    if (!sale) return null;

    const { rows: items } = await query(
      `SELECT si.*, pv.size, pv.color, pv.barcode, p.name AS product_name
       FROM sale_items si
       JOIN product_variants pv ON si.variant_id = pv.id
       JOIN products p ON pv.product_id = p.id
       WHERE si.sale_id = $1`,
      [id]
    );

    const { rows: payments } = await query(
      'SELECT * FROM payments WHERE sale_id = $1',
      [id]
    );

    return { ...sale, items, payments };
  },

  findAll: async ({ startDate, endDate, userId, status, limit = 50, offset = 0 } = {}) => {
    const conditions = [];
    const params = [];
    let i = 1;

    if (startDate) { conditions.push(`s.created_at >= $${i++}`); params.push(startDate); }
    if (endDate)   { conditions.push(`s.created_at <= $${i++}`); params.push(endDate); }
    if (userId)    { conditions.push(`s.user_id = $${i++}`);     params.push(userId); }
    if (status)    { conditions.push(`s.status = $${i++}`);      params.push(status); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await query(
      `SELECT s.*, u.name AS cashier_name, c.name AS customer_name
       FROM sales s
       JOIN users u ON s.user_id = u.id
       LEFT JOIN customers c ON s.customer_id = c.id
       ${where}
       ORDER BY s.created_at DESC
       LIMIT $${i++} OFFSET $${i++}`,
      [...params, limit, offset]
    );
    return rows;
  },

  getDailySummary: async (date) => {
    const { rows } = await query(
      `SELECT
         COUNT(*)::int                     AS total_transactions,
         COALESCE(SUM(total), 0)           AS total_revenue,
         COALESCE(SUM(discount_amount), 0) AS total_discounts,
         COALESCE(AVG(total), 0)           AS average_sale
       FROM sales
       WHERE DATE(created_at) = $1 AND status = 'completed'`,
      [date]
    );
    return rows[0];
  },

  updateStatus: async (id, status) => {
    const { rows } = await query(
      `UPDATE sales SET status = $1 WHERE id = $2 RETURNING *`,
      [status, id]
    );
    return rows[0] || null;
  },
};

export default SaleModel;