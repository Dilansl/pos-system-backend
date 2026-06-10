import bcrypt from 'bcryptjs';
import { query } from './db.js';
import pool from './db.js';

const passwordHash = await bcrypt.hash('admin123', 12);

await query(
  `INSERT INTO users (name, username, password_hash, role)
   VALUES ($1, $2, $3, $4)
   ON CONFLICT (username) DO NOTHING`,
  ['Admin', 'admin', passwordHash, 'admin']
);

console.log('✅ Admin account created');
console.log('   Username: admin');
console.log('   Password: admin123');

await pool.end();