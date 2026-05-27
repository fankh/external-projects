/**
 * Role Service - Database operations for Role-Based Access Control
 */

const { Role } = require('../models');
const { Op } = require('sequelize');

class RoleService {
  /**
   * Get all roles
   */
  static async getAllRoles(tenantId) {
    return Role.findAll({
      where: { tenantId },
      order: [['name', 'ASC']]
    });
  }

  /**
   * Get role by name
   */
  static async getRoleByName(name, tenantId) {
    const role = await Role.findOne({
      where: { name, tenantId }
    });

    if (!role) {
      throw new Error('Role not found');
    }

    return role;
  }

  /**
   * Get role by ID
   */
  static async getRoleById(id, tenantId) {
    const role = await Role.findOne({
      where: { id, tenantId }
    });

    if (!role) {
      throw new Error('Role not found');
    }

    return role;
  }

  /**
   * Create new role
   */
  static async createRole({ name, description, permissions = [], tenantId }) {
    // Check if role already exists
    const existing = await Role.findOne({ where: { name, tenantId } });
    if (existing) {
      throw new Error('Role with this name already exists');
    }

    return Role.create({
      name,
      description,
      permissions,
      tenantId
    });
  }

  /**
   * Update role
   */
  static async updateRole(id, { description, permissions }, tenantId) {
    const role = await Role.findOne({ where: { id, tenantId } });
    if (!role) {
      throw new Error('Role not found');
    }

    if (description) role.description = description;
    if (permissions) role.permissions = permissions;

    await role.save();

    return role;
  }

  /**
   * Delete role
   */
  static async deleteRole(id, tenantId) {
    const role = await Role.findOne({ where: { id, tenantId } });
    if (!role) {
      throw new Error('Role not found');
    }

    await role.destroy();
    return { success: true, message: 'Role deleted successfully' };
  }

  /**
   * Check if role has permission
   */
  static async hasPermission(roleName, permission, tenantId) {
    const role = await Role.findOne({
      where: { name: roleName, tenantId }
    });

    if (!role) {
      return false;
    }

    return role.permissions && role.permissions.includes(permission);
  }

  /**
   * Add permission to role
   */
  static async addPermission(id, permission, tenantId) {
    const role = await Role.findOne({ where: { id, tenantId } });
    if (!role) {
      throw new Error('Role not found');
    }

    if (!role.permissions.includes(permission)) {
      role.permissions.push(permission);
      await role.save();
    }

    return role;
  }

  /**
   * Remove permission from role
   */
  static async removePermission(id, permission, tenantId) {
    const role = await Role.findOne({ where: { id, tenantId } });
    if (!role) {
      throw new Error('Role not found');
    }

    role.permissions = role.permissions.filter(p => p !== permission);
    await role.save();

    return role;
  }
}

module.exports = RoleService;
