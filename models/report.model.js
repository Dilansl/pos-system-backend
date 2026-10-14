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
         (SELECT COALESCE(SUM(refund_amount), 0) FROM returns
          WHERE created_at BETWEEN $1 AND $2)   AS total_refunds
       FROM sales
       WHERE created_at BETWEEN $1 AND $2 AND status != 'held'`,
      [startDate, endDate]
    );

    // Cost of goods sold and profit — every completed sale, minus whatever
    // was later returned (partially returned bills still count for the rest).
    const { rows: profitRows } = await query(
      `SELECT
         COALESCE(SUM(si.line_total - COALESCE(r.refunded, 0)), 0)               AS goods_revenue,
         COALESCE(SUM(si.cost_price * (si.quantity - COALESCE(r.qty, 0))), 0)   AS total_cost
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       LEFT JOIN (
         SELECT sale_item_id, SUM(quantity) AS qty, SUM(refund_amount) AS refunded
         FROM return_items GROUP BY sale_item_id
       ) r ON r.sale_item_id = si.id
       WHERE s.created_at BETWEEN $1 AND $2
         AND s.status IN ('completed', 'partially_refunded', 'refunded')`,
      [startDate, endDate]
    );

    const goodsRevenue = Number(profitRows[0].goods_revenue);
    const totalCost = Number(profitRows[0].total_cost);
    const totalProfit = goodsRevenue - totalCost;
    const margin = goodsRevenue > 0 ? (totalProfit / goodsRevenue) * 100 : 0;

    return {
      ...rows[0],
      total_cost: totalCost,
      total_profit: totalProfit,
      profit_margin: margin,
    };
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
              SUM(si.line_total)     AS total_revenue,
              SUM(si.cost_price * si.quantity)            AS total_cost,
              SUM(si.line_total - (si.cost_price * si.quantity)) AS total_profit
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

  // Every cashier-given discount (bargain + bill share) — who gave it, who
  // approved it, and why.
  getDiscountLog: async ({ startDate, endDate }) => {
    const { rows } = await query(
      `SELECT d.id, d.created_at, d.discount_amount, d.discount_percent, d.reason,
              s.receipt_seq, s.id AS sale_id,
              u.name AS cashier_name, a.name AS approved_by_name,
              p.name AS product_name, pv.size, pv.color
       FROM discount_logs d
       JOIN sales s ON d.sale_id = s.id
       JOIN users u ON d.user_id = u.id
       LEFT JOIN users a ON d.approved_by = a.id
       LEFT JOIN product_variants pv ON d.variant_id = pv.id
       LEFT JOIN products p ON pv.product_id = p.id
       WHERE d.created_at BETWEEN $1 AND $2
       ORDER BY d.created_at DESC
       LIMIT 500`,
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