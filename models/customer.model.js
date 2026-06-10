import { query } from '../config/db.js';

const CustomerModel = {

  findAll: async () => {
    const { rows } = await query(
      `SELECT *, (SELECT COUNT(*) FROM sales WHERE customer_id = customers.id)::int AS total_visits
       FROM customers ORDER BY name ASC`
    );
    return rows;
  },

  findById: async (id) => {
    const { rows: [customer] } = await query(
      'SELECT * FROM customers WHERE id = $1',
      [id]
    );
    if (!customer) return null;

    const { rows: history } = await query(
      `SELECT s.id, s.total, s.created_at, s.status
       FROM sales s WHERE s.customer_id = $1
       ORDER BY s.created_at DESC LIMIT 20`,
      [id]
    );
    return { ...customer, purchaseHistory: history };
  },

  findByPhone: async (phone) => {
    const { rows } = await query(
      'SELECT * FROM customers WHERE phone = $1',
      [phone]
    );
    return rows[0] || null;
  },

  create: async ({ name, phone, email }) => {
    const { rows } = await query(
      `INSERT INTO customers (name, phone, email)
       VALUES ($1, $2, $3) RETURNING *`,
      [name, phone, email]
    );
    return rows[0];
  },

  update: async (id, { name, phone, email }) => {
    const { rows } = await query(
      `UPDATE customers SET name = $1, phone = $2, email = $3
       WHERE id = $4 RETURNING *`,
      [name, phone, email, id]
    );
    return rows[0] || null;
  },
};

export default CustomerModel;