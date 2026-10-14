import { query } from '../config/db.js';

const DEFAULT_DISCOUNT_LIMITS = { cashier: 10, manager: 30, admin: 100 };
const DEFAULT_CASH_OUT_LIMIT = 1000;
// Printed on receipts and barcode labels; admin edits them in Staff.
const DEFAULT_SHOP = {
  name: 'ROPYCO Fashion',
  tagline: 'Clothing Shop',
  address: 'Nittambuwwa, Sri Lanka',
  phone: '0706201176',
  tin: '',
  receiptFooter: 'Thank you for shopping!',
};

const SettingsModel = {
  // Max cashier-given discount (bargain + bill share) per line, as a % of the
  // line's price after promo, keyed by role.
  getDiscountLimits: async () => {
    const { rows: [row] } = await query(
      `SELECT value FROM settings WHERE key = 'discount_limits'`
    );
    return { ...DEFAULT_DISCOUNT_LIMITS, ...(row?.value || {}) };
  },

  setDiscountLimits: async (limits) => {
    const { rows: [row] } = await query(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ('discount_limits', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
       RETURNING value`,
      [JSON.stringify(limits)]
    );
    return row.value;
  },

  // Most a cashier can take out of the drawer (petty cash) without a
  // manager PIN, in rupees.
  getCashOutLimit: async () => {
    const { rows: [row] } = await query(
      `SELECT value FROM settings WHERE key = 'cash_out_limit'`
    );
    return Number(row?.value?.cashier ?? DEFAULT_CASH_OUT_LIMIT);
  },

  setCashOutLimit: async (amount) => {
    const { rows: [row] } = await query(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ('cash_out_limit', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
       RETURNING value`,
      [JSON.stringify({ cashier: amount })]
    );
    return Number(row.value.cashier);
  },

  getShop: async () => {
    const { rows: [row] } = await query(
      `SELECT value FROM settings WHERE key = 'shop'`
    );
    return { ...DEFAULT_SHOP, ...(row?.value || {}) };
  },

  setShop: async (shop) => {
    const { rows: [row] } = await query(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ('shop', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
       RETURNING value`,
      [JSON.stringify(shop)]
    );
    return { ...DEFAULT_SHOP, ...row.value };
  },

  // Managers/admins who have set an approval PIN — shown to the cashier in
  // the approval dialog (names only).
  getApprovers: async () => {
    const { rows } = await query(
      `SELECT id, name, role FROM users
       WHERE role IN ('manager', 'admin')
         AND is_active = true
         AND approval_pin_hash IS NOT NULL
       ORDER BY name ASC`
    );
    return rows;
  },
};

export default SettingsModel;
