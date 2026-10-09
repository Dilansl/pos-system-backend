import { query } from '../config/db.js';

const DEFAULT_DISCOUNT_LIMITS = { cashier: 10, manager: 30, admin: 100 };

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
