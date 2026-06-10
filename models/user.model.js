import { query } from '../config/db.js';

const UserModel = {
  findByUsername: async (username) => {
    const { rows } = await query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
    return rows[0] || null;
  },

  findById: async (id) => {
    const { rows } = await query(
      'SELECT id, name, username, role, is_active, created_at, last_login FROM users WHERE id = $1',
      [id]
    );
    return rows[0] || null;
  },

  findAll: async () => {
    const { rows } = await query(
      'SELECT id, name, username, role, is_active, created_at, last_login FROM users ORDER BY name ASC'
    );
    return rows;
  },

  create: async ({ name, username, passwordHash, role }) => {
    const { rows } = await query(
      `INSERT INTO users (name, username, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, username, role, is_active, created_at`,
      [name, username, passwordHash, role]
    );
    return rows[0];
  },

  update: async (id, { name, role }) => {
    const { rows } = await query(
      `UPDATE users SET name = $1, role = $2
       WHERE id = $3
       RETURNING id, name, username, role, is_active`,
      [name, role, id]
    );
    return rows[0] || null;
  },

  updatePassword: async (id, passwordHash) => {
    await query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [passwordHash, id]
    );
  },

  setActive: async (id, isActive) => {
    const { rows } = await query(
      `UPDATE users SET is_active = $1 WHERE id = $2
       RETURNING id, name, username, role, is_active`,
      [isActive, id]
    );
    return rows[0] || null;
  },

  updateLastLogin: async (id) => {
    await query(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [id]
    );
  },
};

export default UserModel;