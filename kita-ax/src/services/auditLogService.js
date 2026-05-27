/**
 * Audit Log Service - Database operations for audit logging
 */

const { AuditLog } = require('../models');
const { Op } = require('sequelize');

class AuditLogService {
  /**
   * Create audit log entry
   */
  static async createLog({ eventType, user, resource, action, status, ipAddress, details, tenantId }) {
    return AuditLog.create({
      eventType,
      user,
      resource,
      action,
      status,
      ipAddress,
      details: details || {},
      tenantId
    });
  }

  /**
   * Get audit logs with pagination, filtering, and search
   */
  static async getAllLogs({ page = 1, pageSize = 10, search, eventType, status, sortBy = 'createdAt', sortOrder = 'desc', tenantId }) {
    const limit = Math.min(parseInt(pageSize), 100);
    const offset = (Math.max(1, parseInt(page)) - 1) * limit;

    const where = { tenantId };

    if (eventType) where.eventType = eventType;
    if (status) where.status = status;

    if (search) {
      where[Op.or] = [
        { user: { [Op.iLike]: `%${search}%` } },
        { action: { [Op.iLike]: `%${search}%` } },
        { resource: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const order = [[sortBy || 'createdAt', sortOrder === 'asc' ? 'ASC' : 'DESC']];

    const { count, rows } = await AuditLog.findAndCountAll({
      where,
      limit,
      offset,
      order
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
   * Get logs by event type
   */
  static async getByEventType(eventType, tenantId, limit = 10) {
    return AuditLog.findAll({
      where: { eventType, tenantId },
      order: [['createdAt', 'DESC']],
      limit
    });
  }

  /**
   * Get logs by user
   */
  static async getByUser(user, tenantId, limit = 20) {
    return AuditLog.findAll({
      where: { user, tenantId },
      order: [['createdAt', 'DESC']],
      limit
    });
  }

  /**
   * Get recent logs
   */
  static async getRecentLogs(tenantId, days = 7, limit = 50) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return AuditLog.findAll({
      where: {
        tenantId,
        createdAt: { [Op.gte]: startDate }
      },
      order: [['createdAt', 'DESC']],
      limit
    });
  }

  /**
   * Get failed attempts
   */
  static async getFailedAttempts(tenantId, hours = 24, limit = 100) {
    const startTime = new Date();
    startTime.setHours(startTime.getHours() - hours);

    return AuditLog.findAll({
      where: {
        tenantId,
        status: 'failure',
        createdAt: { [Op.gte]: startTime }
      },
      order: [['createdAt', 'DESC']],
      limit
    });
  }

  /**
   * Get logs for report
   */
  static async getLogsForReport(tenantId, startDate, endDate) {
    return AuditLog.findAll({
      where: {
        tenantId,
        createdAt: {
          [Op.between]: [startDate, endDate]
        }
      },
      order: [['createdAt', 'DESC']]
    });
  }

  /**
   * Count logs by status
   */
  static async countByStatus(tenantId) {
    return AuditLog.findAll({
      where: { tenantId },
      attributes: [
        'status',
        [AuditLog.sequelize.fn('COUNT', AuditLog.sequelize.col('id')), 'count']
      ],
      group: ['status'],
      raw: true
    });
  }

  /**
   * Delete old logs (for cleanup)
   */
  static async deleteOldLogs(tenantId, daysOld = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    return AuditLog.destroy({
      where: {
        tenantId,
        createdAt: { [Op.lt]: cutoffDate }
      }
    });
  }
}

module.exports = AuditLogService;
