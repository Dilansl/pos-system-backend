import bcrypt from 'bcryptjs';
import UserModel from '../models/user.model.js';

const StaffController = {

  getAll: async (req, res, next) => {
    try {
      const staff = await UserModel.findAll();
      res.json({ success: true, data: staff });
    } catch (err) { next(err); }
  },

  getById: async (req, res, next) => {
    try {
      const user = await UserModel.findById(req.params.id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Staff member not found.',
        });
      }
      res.json({ success: true, data: user });
    } catch (err) { next(err); }
  },

  create: async (req, res, next) => {
    try {
      const { name, username, password, role } = req.body;
      const passwordHash = await bcrypt.hash(password, 12);
      const user = await UserModel.create({ name, username, passwordHash, role });
      res.status(201).json({
        success: true,
        data: user,
        message: 'Staff account created.',
      });
    } catch (err) { next(err); }
  },

  update: async (req, res, next) => {
    try {
      const user = await UserModel.update(req.params.id, req.body);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Staff member not found.',
        });
      }
      res.json({ success: true, data: user });
    } catch (err) { next(err); }
  },

  resetPassword: async (req, res, next) => {
    try {
      const { newPassword } = req.body;
      const passwordHash = await bcrypt.hash(newPassword, 12);
      await UserModel.updatePassword(req.params.id, passwordHash);
      res.json({ success: true, message: 'Password updated.' });
    } catch (err) { next(err); }
  },

  setActive: async (req, res, next) => {
    try {
      const { isActive } = req.body;
      const user = await UserModel.setActive(req.params.id, isActive);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Staff member not found.',
        });
      }
      res.json({ success: true, data: user });
    } catch (err) { next(err); }
  },

};

export default StaffController;