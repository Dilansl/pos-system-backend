// Exchanges at the POS: a return can now be applied as credit toward a new
// sale (refund_method 'exchange' / payment method 'exchange_credit'), is tied
// to the cashier's shift (so cash refunds come out of the expected drawer),
// and records who approved a cashier's cash refund.
export async function up(knex) {
  await knex.raw(`
    ALTER TABLE returns ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES shifts(id);
    ALTER TABLE returns ADD COLUMN IF NOT EXISTS exchange_sale_id UUID REFERENCES sales(id);
    ALTER TABLE returns ADD COLUMN IF NOT EXISTS exchange_amount DECIMAL(10,2) DEFAULT 0;
    ALTER TABLE returns ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id);

    ALTER TABLE returns DROP CONSTRAINT IF EXISTS returns_refund_method_check;
    ALTER TABLE returns ADD CONSTRAINT returns_refund_method_check
      CHECK (refund_method IN ('cash', 'card', 'store_credit', 'exchange'));

    ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_method_check;
    ALTER TABLE payments ADD CONSTRAINT payments_method_check
      CHECK (method IN ('cash', 'card', 'bank_transfer', 'exchange_credit'));

    CREATE INDEX IF NOT EXISTS returns_shift_id_idx ON returns (shift_id);
  `);
}

export async function down(knex) {
  await knex.raw(`
    DROP INDEX IF EXISTS returns_shift_id_idx;

    ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_method_check;
    ALTER TABLE payments ADD CONSTRAINT payments_method_check
      CHECK (method IN ('cash', 'card', 'bank_transfer'));

    ALTER TABLE returns DROP CONSTRAINT IF EXISTS returns_refund_method_check;
    ALTER TABLE returns ADD CONSTRAINT returns_refund_method_check
      CHECK (refund_method IN ('cash', 'card', 'store_credit'));

    ALTER TABLE returns DROP COLUMN IF EXISTS approved_by;
    ALTER TABLE returns DROP COLUMN IF EXISTS exchange_amount;
    ALTER TABLE returns DROP COLUMN IF EXISTS exchange_sale_id;
    ALTER TABLE returns DROP COLUMN IF EXISTS shift_id;
  `);
}
