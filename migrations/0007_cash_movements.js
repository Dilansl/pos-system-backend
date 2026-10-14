// Petty cash during a shift: money put into or taken out of the drawer that
// isn't a sale or refund (tea, transport, change from the bank...). Counted in
// the shift's expected drawer. A cashier's cash-out above the limit in
// settings needs a manager PIN (approved_by).
export async function up(knex) {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS cash_movements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      shift_id UUID NOT NULL REFERENCES shifts(id),
      user_id UUID NOT NULL REFERENCES users(id),
      type VARCHAR(3) NOT NULL CHECK (type IN ('in', 'out')),
      amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
      reason VARCHAR(255) NOT NULL,
      approved_by UUID REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS cash_movements_shift_id_idx ON cash_movements (shift_id);

    INSERT INTO settings (key, value)
    VALUES ('cash_out_limit', '{"cashier": 1000}')
    ON CONFLICT (key) DO NOTHING;
  `);
}

export async function down(knex) {
  await knex.raw(`
    DELETE FROM settings WHERE key = 'cash_out_limit';
    DROP TABLE IF EXISTS cash_movements;
  `);
}
