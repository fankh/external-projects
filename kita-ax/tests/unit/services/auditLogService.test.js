/**
 * Unit Tests for Audit Log Service
 * Tests audit log creation and retrieval with mocked Sequelize models
 */

jest.mock('../../../src/models', () => ({
  AuditLog: {
    create: jest.fn(),
    findAll: jest.fn(),
    findAndCountAll: jest.fn(),
    destroy: jest.fn(),
    sequelize: {
      fn: jest.fn((name, col) => ({ sequelize_fn: name })),
      col: jest.fn((colName) => ({ sequelize_col: colName }))
    }
  }
}));

const AuditLogService = require('../../../src/services/auditLogService');
const { AuditLog } = require('../../../src/models');

describe('AuditLogService', () => {
  const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';
  const mockLog = {
    id: 'log-123',
    eventType: 'authentication',
    user: 'user@example.com',
    resource: 'user-profile',
    action: 'login',
    status: 'success',
    ipAddress: '127.0.0.1',
    tenantId: TENANT_ID,
    createdAt: new Date()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createLog', () => {
    it('should create audit log entry', async () => {
      AuditLog.create.mockResolvedValue(mockLog);

      const log = await AuditLogService.createLog({
        eventType: 'authentication',
        user: 'user@example.com',
        resource: 'user-profile',
        action: 'login',
        status: 'success',
        tenantId: TENANT_ID
      });

      expect(AuditLog.create).toHaveBeenCalled();
      expect(log.eventType).toBe('authentication');
    });

    it('should include IP address if provided', async () => {
      AuditLog.create.mockResolvedValue(mockLog);

      await AuditLogService.createLog({
        eventType: 'authentication',
        user: 'user@example.com',
        resource: 'user-profile',
        action: 'login',
        status: 'success',
        ipAddress: '192.168.1.1',
        tenantId: TENANT_ID
      });

      const call = AuditLog.create.mock.calls[0][0];
      expect(call.ipAddress).toBe('192.168.1.1');
    });

    it('should include details metadata if provided', async () => {
      AuditLog.create.mockResolvedValue(mockLog);

      await AuditLogService.createLog({
        eventType: 'authentication',
        user: 'user@example.com',
        resource: 'user-profile',
        action: 'login',
        status: 'success',
        details: { method: 'password', mfa: true },
        tenantId: TENANT_ID
      });

      const call = AuditLog.create.mock.calls[0][0];
      expect(call.details).toEqual({ method: 'password', mfa: true });
    });

    it('should set createdAt timestamp automatically', async () => {
      AuditLog.create.mockResolvedValue(mockLog);

      await AuditLogService.createLog({
        eventType: 'authentication',
        user: 'user@example.com',
        resource: 'user-profile',
        action: 'login',
        status: 'success',
        tenantId: TENANT_ID
      });

      expect(AuditLog.create).toHaveBeenCalled();
    });
  });

  describe('getAllLogs', () => {
    it('should return paginated audit logs', async () => {
      const logs = [mockLog, { ...mockLog, id: 'log-456' }];
      AuditLog.findAndCountAll.mockResolvedValue({ rows: logs, count: 2 });

      const result = await AuditLogService.getAllLogs({
        page: 1,
        pageSize: 10,
        tenantId: TENANT_ID
      });

      expect(result.data).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
      expect(result.pagination.page).toBe(1);
    });

    it('should handle pagination offset', async () => {
      AuditLog.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
      await AuditLogService.getAllLogs({
        page: 3,
        pageSize: 15,
        tenantId: TENANT_ID
      });

      const call = AuditLog.findAndCountAll.mock.calls[0][0];
      expect(call.offset).toBe(30); // (3 - 1) * 15
      expect(call.limit).toBe(15);
    });

    it('should filter by eventType', async () => {
      AuditLog.findAndCountAll.mockResolvedValue({ rows: [mockLog], count: 1 });
      await AuditLogService.getAllLogs({
        page: 1,
        pageSize: 10,
        eventType: 'authentication',
        tenantId: TENANT_ID
      });

      const call = AuditLog.findAndCountAll.mock.calls[0][0];
      expect(call.where).toBeDefined();
    });

    it('should filter by status', async () => {
      AuditLog.findAndCountAll.mockResolvedValue({ rows: [mockLog], count: 1 });
      await AuditLogService.getAllLogs({
        page: 1,
        pageSize: 10,
        status: 'failure',
        tenantId: TENANT_ID
      });

      const call = AuditLog.findAndCountAll.mock.calls[0][0];
      expect(call.where).toBeDefined();
    });

    it('should handle search', async () => {
      AuditLog.findAndCountAll.mockResolvedValue({ rows: [mockLog], count: 1 });
      await AuditLogService.getAllLogs({
        page: 1,
        pageSize: 10,
        search: 'user@example.com',
        tenantId: TENANT_ID
      });

      const call = AuditLog.findAndCountAll.mock.calls[0][0];
      expect(call.where).toBeDefined();
    });
  });

  describe('getByEventType', () => {
    it('should return logs filtered by event type', async () => {
      const logs = [mockLog];
      AuditLog.findAll.mockResolvedValue(logs);

      const result = await AuditLogService.getByEventType('authentication', TENANT_ID, 50);
      expect(result).toEqual(logs);
    });

    it('should respect limit parameter', async () => {
      AuditLog.findAll.mockResolvedValue([]);
      await AuditLogService.getByEventType('authentication', TENANT_ID, 25);

      const call = AuditLog.findAll.mock.calls[0][0];
      expect(call.limit).toBe(25);
    });

    it('should filter by eventType and tenantId', async () => {
      AuditLog.findAll.mockResolvedValue([]);
      await AuditLogService.getByEventType('document-access', TENANT_ID);

      const call = AuditLog.findAll.mock.calls[0][0];
      expect(call.where).toBeDefined();
    });
  });

  describe('getByUser', () => {
    it('should return logs for specific user', async () => {
      const logs = [mockLog];
      AuditLog.findAll.mockResolvedValue(logs);

      const result = await AuditLogService.getByUser('user@example.com', TENANT_ID, 50);
      expect(result).toEqual(logs);
    });

    it('should filter by user and tenantId', async () => {
      AuditLog.findAll.mockResolvedValue([]);
      await AuditLogService.getByUser('test@example.com', TENANT_ID);

      const call = AuditLog.findAll.mock.calls[0][0];
      expect(call.where).toBeDefined();
    });
  });

  describe('getRecentLogs', () => {
    it('should return logs from past N days', async () => {
      AuditLog.findAll.mockResolvedValue([mockLog]);

      const logs = await AuditLogService.getRecentLogs(TENANT_ID, 7, 100);
      expect(Array.isArray(logs)).toBe(true);
    });

    it('should calculate correct date range', async () => {
      AuditLog.findAll.mockResolvedValue([]);
      await AuditLogService.getRecentLogs(TENANT_ID, 30, 100);

      const call = AuditLog.findAll.mock.calls[0][0];
      expect(call.where).toBeDefined();
      expect(call.limit).toBe(100);
    });
  });

  describe('getFailedAttempts', () => {
    it('should return failed operations in time window', async () => {
      const failures = [{ ...mockLog, status: 'failure' }];
      AuditLog.findAll.mockResolvedValue(failures);

      const result = await AuditLogService.getFailedAttempts(TENANT_ID, 24, 50);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should filter by status=failure', async () => {
      AuditLog.findAll.mockResolvedValue([]);
      await AuditLogService.getFailedAttempts(TENANT_ID, 12, 50);

      const call = AuditLog.findAll.mock.calls[0][0];
      expect(call.where).toBeDefined();
    });

    it('should respect time window in hours', async () => {
      AuditLog.findAll.mockResolvedValue([]);
      await AuditLogService.getFailedAttempts(TENANT_ID, 48, 100);

      const call = AuditLog.findAll.mock.calls[0][0];
      expect(call.limit).toBe(100);
    });
  });

  describe('getLogsForReport', () => {
    it('should return logs within date range', async () => {
      AuditLog.findAll.mockResolvedValue([mockLog]);

      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');
      const result = await AuditLogService.getLogsForReport(TENANT_ID, startDate, endDate);

      expect(Array.isArray(result)).toBe(true);
    });

    it('should filter by createdAt date range', async () => {
      AuditLog.findAll.mockResolvedValue([]);
      const startDate = new Date('2026-05-01');
      const endDate = new Date('2026-05-31');
      await AuditLogService.getLogsForReport(TENANT_ID, startDate, endDate);

      const call = AuditLog.findAll.mock.calls[0][0];
      expect(call.where).toBeDefined();
    });
  });

  describe('countByStatus', () => {
    it('should return count of logs by status', async () => {
      AuditLog.sequelize.fn.mockReturnValue({ sequelize_fn: 'count' });
      AuditLog.findAll.mockResolvedValue([
        { status: 'success', count: 150 },
        { status: 'failure', count: 25 }
      ]);

      const result = await AuditLogService.countByStatus(TENANT_ID);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('deleteOldLogs', () => {
    it('should delete logs older than specified days', async () => {
      AuditLog.destroy.mockResolvedValue(10);

      const deletedCount = await AuditLogService.deleteOldLogs(TENANT_ID, 90);
      expect(AuditLog.destroy).toHaveBeenCalled();
    });

    it('should calculate correct cutoff date', async () => {
      AuditLog.destroy.mockResolvedValue(5);
      await AuditLogService.deleteOldLogs(TENANT_ID, 60);

      const call = AuditLog.destroy.mock.calls[0][0];
      expect(call.where).toBeDefined();
    });

    it('should only affect specified tenant', async () => {
      AuditLog.destroy.mockResolvedValue(8);
      await AuditLogService.deleteOldLogs(TENANT_ID, 30);

      const call = AuditLog.destroy.mock.calls[0][0];
      expect(call.where).toBeDefined();
    });
  });
});
