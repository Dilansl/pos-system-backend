import jwt from 'jsonwebtoken';
import UserModel from '../models/user.model.js';

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No token provided.',
    });
  }

  const token = authHeader.split(' ')[1];

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Session expired. Please log in again.',
      });
    }
    return res.status(401).json({
      success: false,
      message: 'Invalid token. Please log in again.',
    });
  }

  try {
    // Signature/expiry alone isn't enough — re-check the account is still
    // active and the token was issued after the last revocation (deactivation
    // or password reset), so a killed session can't keep working until it expires.
    const user = await UserModel.findById(decoded.id);
    if (!user || !user.is_active) {
      return res.status(401).json({
        success: false,
        message: 'Account inactive. Please contact an administrator.',
      });
    }
    if (user.token_valid_after && decoded.iat * 1000 < new Date(user.token_valid_after).getTime()) {
      return res.status(401).json({
        success: false,
        message: 'Session revoked. Please log in again.',
      });
    }
    req.user = decoded;
    next();
  } catch (err) {
    next(err);
  }
};

export default authenticate;