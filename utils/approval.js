import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { query } from '../config/db.js';

// Manager-approval tokens ('discount' | 'refund'). Each kind is signed with its
// own derived secret and type claim, so one can never be mistaken for another
// kind — or replayed as a login token. Long-lived enough to survive the
// offline retry queue; callers bind them to one cashier + one checkout.
const secret = (kind) => `${process.env.JWT_SECRET}:${kind}-approval`;

export const signApproval = (kind, payload, expiresIn = '24h') =>
  jwt.sign({ ...payload, typ: kind }, secret(kind), { expiresIn });

export const verifyApproval = (kind, token) => {
  try {
    const decoded = jwt.verify(token, secret(kind));
    return decoded.typ === kind ? decoded : null;
  } catch {
    return null;
  }
};

// The manager/admin typed their PIN at the till — returns them if it matches.
export const checkApproverPin = async (approverId, pin) => {
  const { rows: [approver] } = await query(
    `SELECT id, name, role, is_active, approval_pin_hash FROM users WHERE id = $1`,
    [approverId]
  );
  if (!approver?.approval_pin_hash || !approver.is_active
      || !['manager', 'admin'].includes(approver.role)) {
    return null;
  }
  const ok = await bcrypt.compare(String(pin), approver.approval_pin_hash);
  return ok ? approver : null;
};
