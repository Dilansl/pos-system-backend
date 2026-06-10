import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
    process.exit(1);
  }
  console.log('✅ PostgreSQL connected successfully');
  release();
});

export const query = (text, params) => pool.query(text, params);
export const getClient = () => pool.connect();
export default pool;