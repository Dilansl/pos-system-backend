import 'dotenv/config';

export default {
  client: 'pg',
  connection: {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true'
      ? { rejectUnauthorized: false }
      : false,
  },
  migrations: {
    directory: './migrations',
  },
};
