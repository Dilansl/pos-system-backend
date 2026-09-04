export async function up(knex) {
  await knex.raw(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS token_valid_after TIMESTAMP NULL;
  `);
}

export async function down(knex) {
  await knex.raw(`
    ALTER TABLE users DROP COLUMN IF EXISTS token_valid_after;
  `);
}
