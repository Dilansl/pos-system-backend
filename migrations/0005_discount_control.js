// Discount control: per-role limits (settings), manager approval PINs,
// bill-level discount on sales, and an audit log of every cashier discount.
export async function up(knex) {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS settings (
      key VARCHAR(100) PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW()
    );

    INSERT INTO settings (key, value)
    VALUES ('discount_limits', '{"cashier": 10, "manager": 30, "admin": 100}')
    ON CONFLICT (key) DO NOTHING;

    ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_pin_hash VARCHAR(255);

    ALTER TABLE sales ADD COLUMN IF NOT EXISTS bill_discount_amount DECIMAL(10,2) DEFAULT 0;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS discount_reason VARCHAR(255);
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS discount_approved_by UUID REFERENCES users(id);

    CREATE TABLE IF NOT EXISTS discount_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
      variant_id UUID REFERENCES product_variants(id),
      user_id UUID REFERENCES users(id),
      approved_by UUID REFERENCES users(id),
      discount_amount DECIMAL(10,2) NOT NULL,
      discount_percent DECIMAL(5,2) NOT NULL,
      reason VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS discount_logs_created_at_idx ON discount_logs (created_at);
  `);
}

export async function down(knex) {
  await knex.raw(`
    DROP TABLE IF EXISTS discount_logs;
    ALTER TABLE sales DROP COLUMN IF EXISTS discount_approved_by;
    ALTER TABLE sales DROP COLUMN IF EXISTS discount_reason;
    ALTER TABLE sales DROP COLUMN IF EXISTS bill_discount_amount;
    ALTER TABLE users DROP COLUMN IF EXISTS approval_pin_hash;
    DROP TABLE IF EXISTS settings;
  `);
}
