import jwt from 'jsonwebtoken';

// Approval tokens are signed with a derived secret and a distinct type claim
// so one can never be mistaken for (or replayed as) a login token.
const secret = () => `${process.env.JWT_SECRET}:discount-approval`;
const TYPE = 'discount_approval';

// Bound to one checkout attempt (idempotency key) and one cashier, so it
// can't be reused on later sales. Long-lived enough to survive the offline
// retry queue.
export const signApproval = ({ approverId, cashierId, idempotencyKey, maxPercent }) =>
  jwt.sign(
    { typ: TYPE, approverId, cashierId, idempotencyKey, maxPercent },
    secret(),
    { expiresIn: '24h' }
  );

export const verifyApproval = (token) => {
  try {
    const decoded = jwt.verify(token, secret());
    return decoded.typ === TYPE ? decoded : null;
  } catch {
    return null;
  }
};
