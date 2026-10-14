import { AppError } from '../utils/appError.js';
import { query, getClient } from '../config/db.js';

const round2 = (n) => Math.round(n * 100) / 100;

// Returns items from an original sale inside the caller's transaction:
// validates quantities, refunds what the customer actually PAID (line total
// after promo/bargain/bill discount, not list price), puts stock back, and
// updates the original sale's status. Used both for plain returns and for
// exchanges (where the credit is applied to a new sale).
// Returns the return row; ret.refund_amount is the total credit.
export const processReturn = async (client, {
  originalSaleId, userId, shiftId, refundMethod, reason, items,
  approvedBy = null, exchangeSaleId = null, exchangeAmount = 0,
}) => {
  const { rows: [original] } = await client.query(
    'SELECT id, status FROM sales WHERE id = $1 FOR UPDATE',
    [originalSaleId]
  );
  if (!original) throw new AppError('Original sale not found.', 404);
  if (original.status === 'held') throw new AppError('That sale was never completed.');

  // refund_amount is a placeholder — recomputed below and updated before commit.
  const { rows: [ret] } = await client.query(
    `INSERT INTO returns
       (original_sale_id, user_id, shift_id, refund_amount, refund_method, reason,
        approved_by, exchange_sale_id, exchange_amount)
     VALUES ($1,$2,$3,0,$4,$5,$6,$7,$8) RETURNING *`,
    [originalSaleId, userId, shiftId, refundMethod, reason || null,
     approvedBy, exchangeSaleId, exchangeAmount]
  );

  let computedRefundTotal = 0;
  for (const item of items) {
    // The item must belong to THIS sale.
    const { rows: [saleItem] } = await client.query(
      `SELECT variant_id, quantity, line_total FROM sale_items
       WHERE id = $1 AND sale_id = $2`,
      [item.saleItemId, originalSaleId]
    );
    if (!saleItem) throw new AppError('That item is not on this bill.');

    // Guard against double-refunding: what's already gone back?
    const { rows: [prev] } = await client.query(
      `SELECT COALESCE(SUM(quantity), 0)::int AS qty,
              COALESCE(SUM(refund_amount), 0) AS amount
       FROM return_items WHERE sale_item_id = $1`,
      [item.saleItemId]
    );
    const remaining = saleItem.quantity - prev.qty;
    if (item.quantity > remaining) {
      throw new AppError(
        `Cannot return ${item.quantity} — only ${remaining} left to return for this item.`
      );
    }

    // Refund the price actually paid. The last units returned get whatever
    // is left, so rounding over several partial returns never over-refunds.
    const lineTotal = Number(saleItem.line_total);
    const itemRefundAmount = item.quantity === remaining
      ? round2(lineTotal - Number(prev.amount))
      : round2((lineTotal / saleItem.quantity) * item.quantity);
    computedRefundTotal += itemRefundAmount;

    await client.query(
      `INSERT INTO return_items (return_id, sale_item_id, quantity, refund_amount)
       VALUES ($1,$2,$3,$4)`,
      [ret.id, item.saleItemId, item.quantity, itemRefundAmount]
    );

    const { rows: [stock] } = await client.query(
      'SELECT * FROM stock WHERE variant_id = $1 FOR UPDATE',
      [saleItem.variant_id]
    );
    if (!stock) throw new AppError(`No stock record for variant ${saleItem.variant_id}`);

    const newQty = stock.quantity + item.quantity;
    await client.query(
      `UPDATE stock SET quantity = $1, updated_at = NOW() WHERE variant_id = $2`,
      [newQty, saleItem.variant_id]
    );
    await client.query(
      `INSERT INTO stock_logs
         (variant_id, user_id, change_type, quantity_before, quantity_change, quantity_after, note)
       VALUES ($1,$2,'return',$3,$4,$5,$6)`,
      [saleItem.variant_id, userId, stock.quantity, item.quantity, newQty,
       `Return for sale #${originalSaleId.slice(0, 8)}`]
    );
  }

  // Fully vs partially refunded, across all returns on this sale.
  const { rows: [{ total_sold, total_returned }] } = await client.query(
    `SELECT
       (SELECT COALESCE(SUM(quantity), 0)::int FROM sale_items WHERE sale_id = $1) AS total_sold,
       (SELECT COALESCE(SUM(ri.quantity), 0)::int
          FROM return_items ri JOIN sale_items si ON ri.sale_item_id = si.id
          WHERE si.sale_id = $1) AS total_returned`,
    [originalSaleId]
  );
  const newStatus = total_returned >= total_sold ? 'refunded' : 'partially_refunded';
  await client.query('UPDATE sales SET status = $1 WHERE id = $2', [newStatus, originalSaleId]);

  computedRefundTotal = round2(computedRefundTotal);
  await client.query('UPDATE returns SET refund_amount = $1 WHERE id = $2', [computedRefundTotal, ret.id]);
  ret.refund_amount = computedRefundTotal;
  return ret;
};

const ReturnModel = {

  // Plain return (no new items) — money goes back to the customer.
  // needsApproval: a cashier giving back cash must carry a manager's
  // approval covering at least the refund amount.
  create: async ({ needsApproval, approval, ...data }) => {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const ret = await processReturn(client, { ...data, approvedBy: approval?.approverId || null });
      if (needsApproval && !(approval && approval.maxAmount + 0.01 >= Number(ret.refund_amount))) {
        throw new AppError(
          `Cash refund of Rs. ${Number(ret.refund_amount).toLocaleString()} needs manager approval.`,
          403, 'REFUND_APPROVAL_REQUIRED'
        );
      }
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
      `SELECT r.*, u.name AS staff_name,
              s.total AS original_total,
              s.receipt_seq AS receipt_seq
       FROM returns r
       JOIN users u ON r.user_id = u.id
       JOIN sales s ON r.original_sale_id = s.id
       ORDER BY r.created_at DESC`
    );

    // Attach the refunded items (name + barcode + qty) to each return
    for (const ret of rows) {
      const { rows: items } = await query(
        `SELECT ri.quantity, p.name AS product_name, pv.barcode, pv.size, pv.color
         FROM return_items ri
         JOIN sale_items si ON ri.sale_item_id = si.id
         JOIN product_variants pv ON si.variant_id = pv.id
         JOIN products p ON pv.product_id = p.id
         WHERE ri.return_id = $1`,
        [ret.id]
      );
      ret.items = items;
    }

    return rows;
  },
};

export default ReturnModel;