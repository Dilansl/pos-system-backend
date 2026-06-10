import { query } from '../config/db.js';

const ReportModel = {

  getSalesSummary: async ({ startDate, endDate }) => {
    const { rows } = await query(
      `SELECT
         COUNT(*)::int                          AS total_transactions,
         COALESCE(SUM(total), 0)                AS total_revenue,
         COALESCE(SUM(discount_amount), 0)      AS total_discounts,
         COALESCE(SUM(tax_amount), 0)           AS total_tax,
         COALESCE(AVG(total), 0)                AS average_sale,
         COALESCE(SUM(CASE WHEN status='refunded' THEN total ELSE 0 END), 0) AS total_refunds
       FROM sales
       WHERE created_at BETWEEN $1 AND $2 AND status != 'held'`,
      [startDate, endDate]
    );
    return rows[0];
  },

  getSalesByDay: async ({ startDate, endDate }) => {
    const { rows } = await query(
      `SELECT DATE(created_at) AS date,
              COUNT(*)::int    AS transactions,
              SUM(total)       AS revenue
       FROM sales
       WHERE created_at BETWEEN $1 AND $2 AND status = 'completed'
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [startDate, endDate]
    );
    return rows;
  },

  getBestSellers: async ({ startDate, endDate, limit = 10 }) => {
    const { rows } = await query(
      `SELECT p.id, p.name AS product_name, pv.size, pv.color,
              SUM(si.quantity)::int  AS units_sold,
              SUM(si.line_total)     AS total_revenue
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       JOIN product_variants pv ON si.variant_id = pv.id
       JOIN products p ON pv.product_id = p.id
       WHERE s.created_at BETWEEN $1 AND $2 AND s.status = 'completed'
       GROUP BY p.id, p.name, pv.size, pv.color
       ORDER BY units_sold DESC
       LIMIT $3`,
      [startDate, endDate, limit]
    );
    return rows;
  },

  getSalesByStaff: async ({ startDate, endDate }) => {
    const { rows } = await query(
      `SELECT u.id, u.name AS staff_name, u.role,
              COUNT(s.id)::int          AS total_transactions,
              COALESCE(SUM(s.total), 0) AS total_revenue
       FROM users u
       LEFT JOIN sales s ON s.user_id = u.id
         AND s.created_at BETWEEN $1 AND $2
         AND s.status = 'completed'
       GROUP BY u.id, u.name, u.role
       ORDER BY total_revenue DESC`,
      [startDate, endDate]
    );
    return rows;
  },

  getPaymentBreakdown: async ({ startDate, endDate }) => {
    const { rows } = await query(
      `SELECT p.method,
              COUNT(*)::int AS transactions,
              SUM(p.amount) AS total_amount
       FROM payments p
       JOIN sales s ON p.sale_id = s.id
       WHERE s.created_at BETWEEN $1 AND $2 AND s.status = 'completed'
       GROUP BY p.method
       ORDER BY total_amount DESC`,
      [startDate, endDate]
    );
    return rows;
  },

};

export default ReportModel;