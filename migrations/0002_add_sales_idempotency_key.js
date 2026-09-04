export async function up(knex) {
  await knex.raw(`
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS idempotency_key UUID;
    UPDATE sales SET idempotency_key = gen_random_uuid() WHERE idempotency_key IS NULL;
    ALTER TABLE sales ALTER COLUMN idempotency_key SET NOT NULL;
  `);

  const hasConstraint = await knex.raw(`
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_idempotency_key_unique'
  `);
  if (hasConstraint.rows.length === 0) {
    await knex.raw(`
      ALTER TABLE sales ADD CONSTRAINT sales_idempotency_key_unique UNIQUE (idempotency_key);
    `);
  }
}

export async function down(knex) {
  await knex.raw(`
    ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_idempotency_key_unique;
    ALTER TABLE sales DROP COLUMN IF EXISTS idempotency_key;
  `);
}
