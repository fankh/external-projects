/**
 * Policy Service - Database operations for Access Policies
 */

const { Policy } = require('../models');
const { Op } = require('sequelize');

class PolicyService {
  /**
   * Get all policies
   */
  static async getAllPolicies({ type, status, tenantId }) {
    const where = { tenantId };
    if (type) where.type = type;
    if (status) where.status = status;

    return Policy.findAll({
      where,
      order: [['createdAt', 'DESC']]
    });
  }

  /**
   * Get policy by ID
   */
  static async getPolicyById(id, tenantId) {
    const policy = await Policy.findOne({
      where: { id, tenantId }
    });

    if (!policy) {
      throw new Error('Policy not found');
    }

    return policy;
  }

  /**
   * Get policy by name
   */
  static async getPolicyByName(name, tenantId) {
    const policy = await Policy.findOne({
      where: { name, tenantId }
    });

    if (!policy) {
      throw new Error('Policy not found');
    }

    return policy;
  }

  /**
   * Create new policy
   */
  static async createPolicy({ name, type, target, status = 'active', tenantId }) {
    return Policy.create({
      name,
      type,
      target,
      status,
      tenantId
    });
  }

  /**
   * Update policy
   */
  static async updatePolicy(id, { name, type, target, status }, tenantId) {
    const policy = await Policy.findOne({ where: { id, tenantId } });
    if (!policy) {
      throw new Error('Policy not found');
    }

    if (name) policy.name = name;
    if (type) policy.type = type;
    if (target) policy.target = target;
    if (status) policy.status = status;

    await policy.save();

    return policy;
  }

  /**
   * Delete policy
   */
  static async deletePolicy(id, tenantId) {
    const policy = await Policy.findOne({ where: { id, tenantId } });
    if (!policy) {
      throw new Error('Policy not found');
    }

    await policy.destroy();
    return { success: true, message: 'Policy deleted successfully' };
  }

  /**
   * Get policies by type
   */
  static async getByType(type, tenantId) {
    return Policy.findAll({
      where: { type, tenantId, status: 'active' },
      order: [['createdAt', 'DESC']]
    });
  }

  /**
   * Activate policy
   */
  static async activatePolicy(id, tenantId) {
    const policy = await Policy.findOne({ where: { id, tenantId } });
    if (!policy) {
      throw new Error('Policy not found');
    }

    policy.status = 'active';
    await policy.save();

    return policy;
  }

  /**
   * Deactivate policy
   */
  static async deactivatePolicy(id, tenantId) {
    const policy = await Policy.findOne({ where: { id, tenantId } });
    if (!policy) {
      throw new Error('Policy not found');
    }

    policy.status = 'inactive';
    await policy.save();

    return policy;
  }

  /**
   * Get active policies
   */
  static async getActivePolicies(tenantId) {
    return Policy.findAll({
      where: { tenantId, status: 'active' },
      order: [['createdAt', 'DESC']]
    });
  }
}

module.exports = PolicyService;
