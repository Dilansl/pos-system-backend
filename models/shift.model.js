import { query } from '../config/db.js';

const ShiftModel = {

  // Get the cashier's currently open shift (if any)
  findOpenByUser: async (userId) => {
    const { rows } = await query(
      `SELECT * FROM shifts
       WHERE user_id = $1 AND closed_at IS NULL
       ORDER BY opened_at DESC
       LIMIT 1`,
      [userId]
    );
    return rows[0] || null;
  },

  // Open a new shift
  open: async ({ userId, openingCash, notes }) => {
    const { rows } = await query(
      `INSERT INTO shifts (user_id, opening_cash, notes)
       VALUES ($1, $2, $3) RETURNING *`,
      [userId, openingCash, notes || null]
    );
    return rows[0];
  },

  // Close a shift + compute the cash summary
  close: async (shiftId, { closingCash, notes }) => {
    // Total cash sales during this shift
    const { rows: [cashRow] } = await query(
      `SELECT COALESCE(SUM(p.amount), 0) AS cash_sales
       FROM payments p
       JOIN sales s ON p.sale_id = s.id
       WHERE s.shift_id = $1 AND p.method = 'cash'`,
      [shiftId]
    );

    // Cash paid back to customers during this shift (plain returns, and the
    // part of an exchange not used up by the new items).
    const { rows: [refundRow] } = await query(
      `SELECT COALESCE(SUM(refund_amount - COALESCE(exchange_amount, 0)), 0) AS cash_refunds
       FROM returns
       WHERE shift_id = $1 AND refund_method = 'cash'`,
      [shiftId]
    );

    const { rows } = await query(
      `UPDATE shifts
       SET closing_cash = $1, closed_at = NOW(),
           notes = COALESCE($2, notes)
       WHERE id = $3 AND closed_at IS NULL
       RETURNING *`,
      [closingCash, notes || null, shiftId]
    );

    if (!rows[0]) return null;
    return { ...rows[0], cash_sales: cashRow.cash_sales, cash_refunds: refundRow.cash_refunds };
  },

  // Get a shift by id with its sales summary
  findById: async (shiftId) => {
    const { rows: [shift] } = await query(
      `SELECT s.*, u.name AS cashier_name
       FROM shifts s
       JOIN users u ON s.user_id = u.id
       WHERE s.id = $1`,
      [shiftId]
    );
    if (!shift) return null;

    const { rows: [summary] } = await query(
      `SELECT
         COUNT(*)::int AS total_sales,
         COALESCE(SUM(total), 0) AS total_revenue,
         COALESCE(SUM(CASE WHEN id IN (
           SELECT sale_id FROM payments WHERE method = 'cash'
         ) THEN total ELSE 0 END), 0) AS cash_total
       FROM sales
       WHERE shift_id = $1`,
      [shiftId]
    );

    return { ...shift, summary };
  },
};

export default ShiftModel;