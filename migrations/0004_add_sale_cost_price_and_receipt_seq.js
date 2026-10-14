// Both columns were added by hand to the original database but never made it
// into a migration, so a fresh install failed on its very first sale.
// Guarded so it's a no-op where they already exist.
export async function up(knex) {
  await knex.raw(`
    ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10,2) DEFAULT 0;
  `);

  // Checked explicitly rather than ADD COLUMN IF NOT EXISTS ... SERIAL, which
  // can still create an orphan sequence when the column already exists.
  const hasReceiptSeq = await knex.raw(`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'receipt_seq'
  `);
  if (hasReceiptSeq.rows.length === 0) {
    await knex.raw(`
      ALTER TABLE sales ADD COLUMN receipt_seq SERIAL;
    `);
  }
}

export async function down(knex) {
  await knex.raw(`
    ALTER TABLE sales DROP COLUMN IF EXISTS receipt_seq;
    ALTER TABLE sale_items DROP COLUMN IF EXISTS cost_price;
  `);
}
