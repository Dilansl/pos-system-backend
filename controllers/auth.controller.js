import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import UserModel from '../models/user.model.js';

// Compared against when the username doesn't exist, so a login attempt for a
// nonexistent user still pays the bcrypt cost — this keeps response timing
// from leaking which usernames are valid.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

const AuthController = {

  login: async (req, res, next) => {
    try {
      const { username, password } = req.body;

      // find user by username
      const user = await UserModel.findByUsername(username);

      // Always run bcrypt.compare, valid user or not, to avoid a timing side-channel.
      const passwordValid = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);

      // deliberately vague message — don't reveal which field is wrong
      if (!user || !user.is_active || !passwordValid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid username or password.',
        });
      }

      // create JWT token
      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '12h' }
      );

      // update last login time 
      await UserModel.updateLastLogin(user.id);

      return res.status(200).json({
        success: true,
        message: 'Login successful.',
        data: {
          token,
          user: {
            id: user.id,
            name: user.name,
            username: user.username,
            role: user.role,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  },

  me: async (req, res, next) => {
    try {
      const user = await UserModel.findById(req.user.id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found.',
        });
      }
      return res.json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  },

};

export default AuthController;