/**
 * User Service - Database operations for User model
 */

const bcrypt = require('bcryptjs');
const { User } = require('../models');
const { Op } = require('sequelize');

class UserService {
  /**
   * Get all users with pagination, filtering, and search
   */
  static async getAllUsers({ page = 1, pageSize = 10, search, status, role, sortBy = 'email', sortOrder = 'asc', tenantId }) {
    const limit = Math.min(parseInt(pageSize), 100);
    const offset = (Math.max(1, parseInt(page)) - 1) * limit;

    const where = { tenantId };

    if (status) where.status = status;
    if (role) where.role = role;

    if (search) {
      where[Op.or] = [
        { email: { [Op.iLike]: `%${search}%` } },
        { role: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const order = [[sortBy || 'email', sortOrder === 'desc' ? 'DESC' : 'ASC']];

    const { count, rows } = await User.findAndCountAll({
      where,
      limit,
      offset,
      order,
      attributes: { exclude: ['passwordHash'] }
    });

    return {
      data: rows,
      pagination: {
        page: Math.max(1, parseInt(page)),
        pageSize: limit,
        total: count,
        totalPages: Math.ceil(count / limit),
        hasNext: offset + limit < count,
        hasPrev: offset > 0
      }
    };
  }

  /**
   * Get user by ID
   */
  static async getUserById(id, tenantId) {
    const user = await User.findOne({
      where: { id, tenantId },
      attributes: { exclude: ['passwordHash'] }
    });

    if (!user) {
      throw new Error('User not found');
    }

    return user;
  }

  /**
   * Get user by email
   */
  static async getUserByEmail(email, tenantId) {
    const user = await User.findOne({
      where: { email, tenantId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    return user;
  }

  /**
   * Create new user
   */
  static async createUser({ email, password, role = 'viewer', tenantId, status = 'active' }) {
    // Check if user already exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      email,
      passwordHash,
      role,
      tenantId,
      status
    });

    // Return without password
    return this.getUserById(user.id, tenantId);
  }

  /**
   * Update user
   */
  static async updateUser(id, { email, role, status }, tenantId) {
    const user = await User.findOne({ where: { id, tenantId } });
    if (!user) {
      throw new Error('User not found');
    }

    if (email) user.email = email;
    if (role) user.role = role;
    if (status) user.status = status;

    await user.save();

    return this.getUserById(id, tenantId);
  }

  /**
   * Update user password
   */
  static async updatePassword(id, oldPassword, newPassword, tenantId) {
    const user = await User.findOne({ where: { id, tenantId } });
    if (!user) {
      throw new Error('User not found');
    }

    // Verify old password
    const isValid = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isValid) {
      throw new Error('Invalid current password');
    }

    // Hash new password
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();

    return { success: true, message: 'Password updated successfully' };
  }

  /**
   * Verify password
   */
  static async verifyPassword(email, password, tenantId) {
    const user = await User.findOne({ where: { email, tenantId } });
    if (!user) {
      return false;
    }

    return bcrypt.compare(password, user.passwordHash);
  }

  /**
   * Delete user
   */
  static async deleteUser(id, tenantId) {
    const user = await User.findOne({ where: { id, tenantId } });
    if (!user) {
      throw new Error('User not found');
    }

    await user.destroy();
    return { success: true, message: 'User deleted successfully' };
  }

  /**
   * Update last login
   */
  static async updateLastLogin(email, tenantId) {
    const user = await User.findOne({ where: { email, tenantId } });
    if (user) {
      user.lastLogin = new Date();
      await user.save();
    }
  }

  /**
   * Count users by role
   */
  static async countByRole(role, tenantId) {
    return User.count({
      where: { role, tenantId, status: 'active' }
    });
  }
}

module.exports = UserService;
