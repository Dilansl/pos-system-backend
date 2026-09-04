import bcrypt from 'bcryptjs';
import { query } from './db.js';
import pool from './db.js';

const adminPassword = process.env.SEED_ADMIN_PASSWORD;

if (!adminPassword || adminPassword.length < 8) {
  console.error('❌ Set SEED_ADMIN_PASSWORD (min 8 characters) in the environment before running the seed script.');
  await pool.end();
  process.exit(1);
}

const passwordHash = await bcrypt.hash(adminPassword, 12);

const { rows } = await query(
  `INSERT INTO users (name, username, password_hash, role)
   VALUES ($1, $2, $3, $4)
   ON CONFLICT (username) DO NOTHING
   RETURNING id`,
  ['Admin', 'admin', passwordHash, 'admin']
);

if (rows.length) {
  console.log('✅ Admin account created');
  console.log('   Username: admin');
} else {
  console.log('ℹ️  Admin account already exists — no changes made.');
}

await pool.end();