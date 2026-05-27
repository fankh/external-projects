/**
 * Agent Service - Database operations for AI Agent management
 */

const { Agent } = require('../models');
const crypto = require('crypto');

class AgentService {
  /**
   * Generate unique API key
   */
  static generateApiKey() {
    return `sk-agent-${crypto.randomBytes(24).toString('hex')}`;
  }

  /**
   * Get all agents
   */
  static async getAllAgents({ status, tenantId }) {
    const where = { tenantId };
    if (status) where.status = status;

    return Agent.findAll({
      where,
      attributes: { exclude: ['apiKey'] },
      order: [['name', 'ASC']]
    });
  }

  /**
   * Get agent by ID
   */
  static async getAgentById(id, tenantId) {
    const agent = await Agent.findOne({
      where: { id, tenantId },
      attributes: { exclude: ['apiKey'] }
    });

    if (!agent) {
      throw new Error('Agent not found');
    }

    return agent;
  }

  /**
   * Get agent by name
   */
  static async getAgentByName(name, tenantId) {
    const agent = await Agent.findOne({
      where: { name, tenantId },
      attributes: { exclude: ['apiKey'] }
    });

    if (!agent) {
      throw new Error('Agent not found');
    }

    return agent;
  }

  /**
   * Verify API key
   */
  static async verifyApiKey(apiKey, tenantId) {
    const agent = await Agent.findOne({
      where: { apiKey, tenantId, status: 'active' }
    });

    if (!agent) {
      return null;
    }

    // Update last seen
    agent.lastSeen = new Date();
    await agent.save();

    return agent;
  }

  /**
   * Create new agent
   */
  static async createAgent({ name, type, tenantId, status = 'active' }) {
    const apiKey = this.generateApiKey();

    return Agent.create({
      name,
      type,
      tenantId,
      status,
      apiKey,
      lastSeen: new Date()
    });
  }

  /**
   * Update agent
   */
  static async updateAgent(id, { name, type, status }, tenantId) {
    const agent = await Agent.findOne({ where: { id, tenantId } });
    if (!agent) {
      throw new Error('Agent not found');
    }

    if (name) agent.name = name;
    if (type) agent.type = type;
    if (status) agent.status = status;

    await agent.save();

    return agent;
  }

  /**
   * Delete agent
   */
  static async deleteAgent(id, tenantId) {
    const agent = await Agent.findOne({ where: { id, tenantId } });
    if (!agent) {
      throw new Error('Agent not found');
    }

    await agent.destroy();
    return { success: true, message: 'Agent deleted successfully' };
  }

  /**
   * Regenerate API key
   */
  static async regenerateApiKey(id, tenantId) {
    const agent = await Agent.findOne({ where: { id, tenantId } });
    if (!agent) {
      throw new Error('Agent not found');
    }

    agent.apiKey = this.generateApiKey();
    await agent.save();

    return {
      id: agent.id,
      name: agent.name,
      apiKey: agent.apiKey,
      message: 'API key regenerated successfully'
    };
  }

  /**
   * Activate agent
   */
  static async activateAgent(id, tenantId) {
    const agent = await Agent.findOne({ where: { id, tenantId } });
    if (!agent) {
      throw new Error('Agent not found');
    }

    agent.status = 'active';
    await agent.save();

    return agent;
  }

  /**
   * Deactivate agent
   */
  static async deactivateAgent(id, tenantId) {
    const agent = await Agent.findOne({ where: { id, tenantId } });
    if (!agent) {
      throw new Error('Agent not found');
    }

    agent.status = 'inactive';
    await agent.save();

    return agent;
  }

  /**
   * Get agents by type
   */
  static async getByType(type, tenantId) {
    return Agent.findAll({
      where: { type, tenantId, status: 'active' },
      attributes: { exclude: ['apiKey'] },
      order: [['name', 'ASC']]
    });
  }

  /**
   * Get active agents
   */
  static async getActiveAgents(tenantId) {
    return Agent.findAll({
      where: { tenantId, status: 'active' },
      attributes: { exclude: ['apiKey'] },
      order: [['lastSeen', 'DESC']]
    });
  }

  /**
   * Update last seen
   */
  static async updateLastSeen(id, tenantId) {
    const agent = await Agent.findOne({ where: { id, tenantId } });
    if (agent) {
      agent.lastSeen = new Date();
      await agent.save();
    }
  }
}

module.exports = AgentService;
