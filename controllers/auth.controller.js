import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import UserModel from '../models/user.model.js';

const AuthController = {

  login: async (req, res, next) => {
    try {
      const { username, password } = req.body;

      // find user by username
      const user = await UserModel.findByUsername(username);

      // deliberately vague message — don't reveal which field is wrong
      if (!user || !user.is_active) {
        return res.status(401).json({
          success: false,
          message: 'Invalid username or password.',
        });
      }

      // check password
      const passwordValid = await bcrypt.compare(password, user.password_hash);
      if (!passwordValid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid username or password.',
        });
      }

      // create JWT token
      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
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