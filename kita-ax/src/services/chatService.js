/**
 * Chat Service - Handles chat message operations
 */

const { ChatMessage } = require('../models');
const { Op } = require('sequelize');

class ChatService {
  /**
   * Send a user message and get assistant response
   */
  static async sendMessage({ content, userId, tenantId }) {
    // Create user message
    const userMessage = await ChatMessage.create({
      role: 'user',
      content,
      userId,
      tenantId
    });

    // Generate assistant response (simple echo for now, can be extended with AI)
    const assistantMessage = await ChatMessage.create({
      role: 'assistant',
      content: this.generateAssistantResponse(content),
      userId,
      tenantId
    });

    return {
      userMessage: userMessage.toJSON(),
      assistantMessage: assistantMessage.toJSON()
    };
  }

  /**
   * Get chat message history with pagination
   */
  static async getHistory({ userId, tenantId, page = 0, size = 50 }) {
    const limit = Math.min(parseInt(size), 100);
    const offset = Math.max(0, parseInt(page)) * limit;

    const { count, rows } = await ChatMessage.findAndCountAll({
      where: { userId, tenantId },
      order: [['createdAt', 'ASC']],
      limit,
      offset
    });

    return {
      content: rows.map(msg => msg.toJSON()),
      totalElements: count,
      totalPages: Math.ceil(count / limit),
      number: Math.max(0, parseInt(page)),
      size: limit
    };
  }

  /**
   * Get all messages for a tenant (admin)
   */
  static async getAllMessages({ tenantId, page = 1, pageSize = 10, userId }) {
    const limit = Math.min(parseInt(pageSize), 100);
    const offset = (Math.max(1, parseInt(page)) - 1) * limit;

    const where = { tenantId };
    if (userId) where.userId = userId;

    const { count, rows } = await ChatMessage.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
      offset
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
   * Delete old messages for cleanup
   */
  static async deleteOldMessages(tenantId, daysOld = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    return ChatMessage.destroy({
      where: {
        tenantId,
        createdAt: { [Op.lt]: cutoffDate }
      }
    });
  }

  /**
   * Generate a simple assistant response
   * Can be extended with AI/LLM integration
   */
  static generateAssistantResponse(userMessage) {
    const responses = [
      'I understand. Thank you for your message.',
      'I appreciate your input. How can I help further?',
      'Got it. Is there anything else you would like to know?',
      'Thank you for reaching out. What else can I assist you with?',
      'I see. Please feel free to ask more questions.'
    ];

    return responses[Math.floor(Math.random() * responses.length)];
  }
}

module.exports = ChatService;
