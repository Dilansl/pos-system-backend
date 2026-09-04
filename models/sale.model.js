import { query, getClient } from '../config/db.js';
import SyncQueueModel from './syncQueue.model.js';

const SaleModel = {

  create: async (saleData) => {
    const { shiftId, userId, customerId, taxAmount, notes, items, payments, idempotencyKey, offlineRetry } = saleData;

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
        if (!variant) throw new Error(`Variant ${item.variantId} not found.`);

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

        const itemDiscount = promoDiscount + bargainDiscount;
        const lineTotal = lineGross - itemDiscount;

        pricedItems.push({
          variantId: item.variantId,
          quantity: item.quantity,
          unitPrice,
          discountAmount: itemDiscount,
          lineTotal,
          costPrice: variant.cost_price || 0,
        });
        subtotal += lineGross;
        discountAmount += itemDiscount;
      }

      const safeTaxAmount = Math.max(Number(taxAmount) || 0, 0);
      const total = subtotal - discountAmount + safeTaxAmount;

      const paymentsTotal = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      if (Math.abs(paymentsTotal - total) > 0.01) {
        throw new Error(
          `Payment total (${paymentsTotal.toFixed(2)}) does not match sale total (${total.toFixed(2)}).`
        );
      }

      let sale;
      try {
        ({ rows: [sale] } = await client.query(
          `INSERT INTO sales
             (shift_id, user_id, customer_id, subtotal, discount_amount,
              tax_amount, total, notes, status, idempotency_key)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'completed',$9)
           RETURNING *`,
          [shiftId, userId, customerId, subtotal, discountAmount, safeTaxAmount, total, notes, idempotencyKey]
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

        if (!stock) throw new Error(`No stock record for variant ${item.variantId}`);
        if (stock.quantity < item.quantity) {
          throw new Error(`Insufficient stock. Available: ${stock.quantity}`);
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

      for (const payment of payments) {
        await client.query(
          `INSERT INTO payments (sale_id, method, amount, reference)
           VALUES ($1,$2,$3,$4)`,
          [sale.id, payment.method, payment.amount, payment.reference || null]
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

    return { ...sale, items, payments };
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
              ), 0) AS already_returned
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