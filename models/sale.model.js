import { AppError } from '../utils/appError.js';
import { query, getClient } from '../config/db.js';
import SyncQueueModel from './syncQueue.model.js';
import { processReturn } from './return.model.js';

const round2 = (n) => Math.round(n * 100) / 100;

const SaleModel = {

  create: async (saleData) => {
    const {
      shiftId, userId, customerId, taxAmount, notes, items, payments, idempotencyKey, offlineRetry,
      billDiscountType, billDiscountValue, discountReason,
      discountLimit, approval,
      exchange, userRole, refundApproval,
    } = saleData;

    // Replay protection: if this exact checkout attempt already went through
    // (e.g. the client retried after a network timeout), return the sale that
    // was already created instead of processing it again.
    const { rows: [existing] } = await query(
      'SELECT * FROM sales WHERE idempotency_key = $1',
      [idempotencyKey]
    );
    if (existing) return existing;

    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Price every item from the DB — never trust client-supplied unitPrice/lineTotal.
      let subtotal = 0;
      let discountAmount = 0;
      const pricedItems = [];

      for (const item of items) {
        const { rows: [variant] } = await client.query(
          `SELECT pv.price_override, pv.cost_price, p.base_price,
                  pv.promo_type AS variant_promo_type, pv.promo_value AS variant_promo_value,
                  p.promo_type AS product_promo_type, p.promo_value AS product_promo_value
           FROM product_variants pv
           JOIN products p ON pv.product_id = p.id
           WHERE pv.id = $1`,
          [item.variantId]
        );
        if (!variant) throw new AppError(`Variant ${item.variantId} not found.`);

        const unitPrice = Number(variant.price_override ?? variant.base_price);
        const lineGross = unitPrice * item.quantity;

        // Standing promo (variant clearance wins over product-level promo) is
        // product config, not user input — computed here, never trusted from the client.
        const promoType = variant.variant_promo_type || variant.product_promo_type || null;
        const promoValue = Number(
          variant.variant_promo_type ? variant.variant_promo_value : variant.product_promo_value
        ) || 0;
        let promoDiscount = 0;
        if (promoType && promoValue) {
          promoDiscount = promoType === 'percent'
            ? lineGross * (promoValue / 100)
            : promoValue * item.quantity;
        }
        promoDiscount = Math.min(Math.max(promoDiscount, 0), lineGross);
        const afterPromo = lineGross - promoDiscount;

        // The cashier's own discretionary discount — this IS user input, so it's
        // clamped to what's left after the promo rather than trusted verbatim.
        const bargainType = item.discountType;
        const bargainValue = Number(item.discountValue) || 0;
        let bargainDiscount = 0;
        if (bargainType && bargainValue) {
          bargainDiscount = bargainType === 'percent'
            ? afterPromo * (bargainValue / 100)
            : bargainValue;
        }
        bargainDiscount = Math.min(Math.max(bargainDiscount, 0), afterPromo);

        pricedItems.push({
          variantId: item.variantId,
          quantity: item.quantity,
          unitPrice,
          lineGross,
          promoDiscount,
          afterPromo,
          bargainDiscount,
          costPrice: variant.cost_price || 0,
        });
        subtotal += lineGross;
      }

      // Bill-level discount (cashier input) — on what's left after line
      // discounts, then spread across lines in proportion to their net so
      // per-item revenue/profit and later returns stay accurate.
      const netBeforeBill = pricedItems.reduce((s, i) => s + i.afterPromo - i.bargainDiscount, 0);
      const billValue = Number(billDiscountValue) || 0;
      let billDiscount = 0;
      if (billDiscountType && billValue > 0) {
        billDiscount = billDiscountType === 'percent'
          ? netBeforeBill * (billValue / 100)
          : billValue;
      }
      billDiscount = round2(Math.min(Math.max(billDiscount, 0), netBeforeBill));

      let billLeft = billDiscount;
      pricedItems.forEach((item, idx) => {
        const net = item.afterPromo - item.bargainDiscount;
        const share = idx === pricedItems.length - 1
          ? billLeft
          : (netBeforeBill > 0 ? round2(billDiscount * (net / netBeforeBill)) : 0);
        item.billShare = Math.min(share, net);
        billLeft = round2(billLeft - item.billShare);

        // The cashier's own discount on this line (bargain + bill share) as a
        // % of the price after promo — this is what the role limit caps.
        item.cashierDiscount = item.bargainDiscount + item.billShare;
        item.cashierPercent = item.afterPromo > 0
          ? (item.cashierDiscount / item.afterPromo) * 100
          : 0;
        item.discountAmount = item.promoDiscount + item.cashierDiscount;
        item.lineTotal = item.lineGross - item.discountAmount;
        discountAmount += item.discountAmount;
      });

      // Enforce the cashier's discount limit; above it, a manager approval
      // (verified token bound to this checkout) must cover the largest line.
      const maxPercent = Math.max(0, ...pricedItems.map((i) => i.cashierPercent));
      let approvedBy = null;
      if (maxPercent > discountLimit + 0.01) {
        if (!approval) {
          throw new AppError(
            `Discount of ${maxPercent.toFixed(1)}% is over your ${discountLimit}% limit. Manager approval needed.`,
            403, 'DISCOUNT_APPROVAL_REQUIRED'
          );
        }
        if (approval.maxPercent + 0.01 < maxPercent) {
          throw new AppError(
            `Approval covers up to ${approval.maxPercent}%, but this sale has ${maxPercent.toFixed(1)}%. Ask again.`,
            403, 'DISCOUNT_APPROVAL_REQUIRED'
          );
        }
        approvedBy = approval.approverId;
      }

      const safeTaxAmount = Math.max(Number(taxAmount) || 0, 0);
      const total = subtotal - discountAmount + safeTaxAmount;

      // Exchange: the returned items' credit (what the customer originally
      // paid for them) goes toward this sale. Whatever's left over is paid
      // back to the customer; whatever's short, they pay.
      let exchangeReturn = null;
      let creditApplied = 0;
      let refundOut = 0;
      if (exchange) {
        exchangeReturn = await processReturn(client, {
          originalSaleId: exchange.originalSaleId,
          userId,
          shiftId,
          refundMethod: 'exchange', // finalised below once the amounts are known
          reason: exchange.reason,
          items: exchange.items,
        });
        const credit = Number(exchangeReturn.refund_amount);
        creditApplied = round2(Math.min(credit, total));
        refundOut = round2(credit - creditApplied);

        if (refundOut > 0) {
          if (!['cash', 'card'].includes(exchange.refundMethod)) {
            throw new AppError('Choose how to refund the difference (cash or card).');
          }
          if (exchange.refundMethod === 'cash' && userRole === 'cashier'
              && !(refundApproval && refundApproval.maxAmount + 0.01 >= refundOut)) {
            throw new AppError(
              `Cash refund of Rs. ${refundOut.toLocaleString()} needs manager approval.`,
              403, 'REFUND_APPROVAL_REQUIRED'
            );
          }
        }
      }

      const amountDue = round2(total - creditApplied);
      const paymentsTotal = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      if (Math.abs(paymentsTotal - amountDue) > 0.01) {
        throw new AppError(
          `Payment total (${paymentsTotal.toFixed(2)}) does not match amount due (${amountDue.toFixed(2)}).`
        );
      }

      let sale;
      try {
        ({ rows: [sale] } = await client.query(
          `INSERT INTO sales
             (shift_id, user_id, customer_id, subtotal, discount_amount,
              tax_amount, total, notes, status, idempotency_key,
              bill_discount_amount, discount_reason, discount_approved_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'completed',$9,$10,$11,$12)
           RETURNING *`,
          [shiftId, userId, customerId, subtotal, discountAmount, safeTaxAmount, total, notes, idempotencyKey,
           billDiscount, discountReason?.trim() || null, approvedBy]
        ));
      } catch (err) {
        // Concurrent duplicate submission with the same key raced us — the other
        // request already inserted it. Return that row instead of failing.
        if (err.code === '23505' && err.constraint === 'sales_idempotency_key_unique') {
          await client.query('ROLLBACK');
          const { rows: [race] } = await query(
            'SELECT * FROM sales WHERE idempotency_key = $1',
            [idempotencyKey]
          );
          return race;
        }
        throw err;
      }

      for (const item of pricedItems) {
        await client.query(
          `INSERT INTO sale_items
            (sale_id, variant_id, quantity, unit_price, discount_amount, line_total, cost_price)
          VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [sale.id, item.variantId, item.quantity, item.unitPrice,
          item.discountAmount, item.lineTotal, item.costPrice]
        );

        const { rows: [stock] } = await client.query(
          'SELECT * FROM stock WHERE variant_id = $1 FOR UPDATE',
          [item.variantId]
        );

        if (!stock) throw new AppError(`No stock record for variant ${item.variantId}`);
        if (stock.quantity < item.quantity) {
          throw new AppError(`Insufficient stock. Available: ${stock.quantity}`);
        }

        const newQty = stock.quantity - item.quantity;

        await client.query(
          `UPDATE stock SET quantity = $1, updated_at = NOW() WHERE variant_id = $2`,
          [newQty, item.variantId]
        );

        await client.query(
          `INSERT INTO stock_logs
             (variant_id, user_id, change_type, quantity_before, quantity_change, quantity_after, note)
           VALUES ($1,$2,'sale',$3,$4,$5,$6)`,
          [item.variantId, userId, stock.quantity, -item.quantity, newQty,
           `Sale #${sale.id.slice(0, 8)}`]
        );
      }

      // Audit trail: one row per line the cashier discounted.
      for (const item of pricedItems) {
        if (item.cashierDiscount <= 0) continue;
        await client.query(
          `INSERT INTO discount_logs
             (sale_id, variant_id, user_id, approved_by, discount_amount, discount_percent, reason)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [sale.id, item.variantId, userId, approvedBy, round2(item.cashierDiscount),
           round2(item.cashierPercent), discountReason?.trim() || null]
        );
      }

      for (const payment of payments) {
        if (!(Number(payment.amount) > 0)) continue;
        await client.query(
          `INSERT INTO payments (sale_id, method, amount, reference)
           VALUES ($1,$2,$3,$4)`,
          [sale.id, payment.method, payment.amount, payment.reference || null]
        );
      }

      if (exchangeReturn) {
        if (creditApplied > 0) {
          await client.query(
            `INSERT INTO payments (sale_id, method, amount, reference)
             VALUES ($1,'exchange_credit',$2,$3)`,
            [sale.id, creditApplied, `Return ${exchangeReturn.id.slice(0, 8)}`]
          );
        }
        await client.query(
          `UPDATE returns
           SET exchange_sale_id = $1, exchange_amount = $2, refund_method = $3, approved_by = $4
           WHERE id = $5`,
          [sale.id, creditApplied, refundOut > 0 ? exchange.refundMethod : 'exchange',
           refundOut > 0 && exchange.refundMethod === 'cash' ? (refundApproval?.approverId || null) : null,
           exchangeReturn.id]
        );
      }

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

      if (offlineRetry) {
        await SyncQueueModel.logSynced(client, {
          actionType: 'sale',
          payload: { saleId: sale.id, idempotencyKey },
        });
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

    // If this sale was an exchange: what came back, from which bill, and any
    // difference refunded — printed on the receipt.
    const { rows: [exchange] } = await query(
      `SELECT r.id, r.refund_amount, r.exchange_amount, r.refund_method,
              s.receipt_seq AS original_receipt_seq
       FROM returns r
       JOIN sales s ON r.original_sale_id = s.id
       WHERE r.exchange_sale_id = $1`,
      [id]
    );
    if (exchange) {
      const { rows: returnedItems } = await query(
        `SELECT ri.quantity, ri.refund_amount, pv.size, pv.color, p.name AS product_name
         FROM return_items ri
         JOIN sale_items si ON ri.sale_item_id = si.id
         JOIN product_variants pv ON si.variant_id = pv.id
         JOIN products p ON pv.product_id = p.id
         WHERE ri.return_id = $1`,
        [exchange.id]
      );
      exchange.items = returnedItems;
    }

    return { ...sale, items, payments, exchange: exchange || null };
  },

  findByReceiptSeq: async (seq) => {
    const { rows: [sale] } = await query(
      `SELECT s.*,
              u.name AS cashier_name,
              c.name AS customer_name, c.phone AS customer_phone
       FROM sales s
       JOIN users u ON s.user_id = u.id
       LEFT JOIN customers c ON s.customer_id = c.id
       WHERE s.receipt_seq = $1`,
      [seq]
    );
    if (!sale) return null;

    const { rows: items } = await query(
      `SELECT si.*, pv.size, pv.color, pv.barcode, p.name AS product_name,
              COALESCE((
                SELECT SUM(ri.quantity)::int
                FROM return_items ri
                WHERE ri.sale_item_id = si.id
              ), 0) AS already_returned,
              COALESCE((
                SELECT SUM(ri.refund_amount)
                FROM return_items ri
                WHERE ri.sale_item_id = si.id
              ), 0) AS already_refunded
       FROM sale_items si
       JOIN product_variants pv ON si.variant_id = pv.id
       JOIN products p ON pv.product_id = p.id
       WHERE si.sale_id = $1`,
      [sale.id]
    );

    const { rows: payments } = await query(
      'SELECT * FROM payments WHERE sale_id = $1',
      [sale.id]
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