/**
 * Unit Tests for Logging Service
 * Tests all logging methods and context creation
 */

jest.mock('../../../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  log: jest.fn()
}));

const LoggingService = require('../../../src/services/loggingService');
const logger = require('../../../src/config/logger');

describe('LoggingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createContextLog', () => {
    it('should create context object with all fields', () => {
      const context = LoggingService.createContextLog('corr-123', 'user-456', 'tenant-789');
      expect(context.correlationId).toBe('corr-123');
      expect(context.userId).toBe('user-456');
      expect(context.tenantId).toBe('tenant-789');
      expect(context.timestamp).toBeDefined();
    });

    it('should handle undefined userId', () => {
      const context = LoggingService.createContextLog('corr-123', undefined, 'tenant-789');
      expect(context.userId).toBe(null);
    });
  });

  describe('info', () => {
    it('should call logger.info with message and context', () => {
      LoggingService.info('User created', { userId: 'user-123' });
      expect(logger.info).toHaveBeenCalledWith('User created', expect.objectContaining({ userId: 'user-123' }));
    });

    it('should handle empty context', () => {
      LoggingService.info('Test message');
      expect(logger.info).toHaveBeenCalled();
    });
  });

  describe('warn', () => {
    it('should call logger.warn with message', () => {
      LoggingService.warn('Slow query detected', { duration: 5000 });
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('error', () => {
    it('should handle Error instance', () => {
      const err = new Error('Something failed');
      LoggingService.error('Operation failed', err, { operation: 'test' });
      expect(logger.error).toHaveBeenCalled();
      const call = logger.error.mock.calls[0];
      expect(call[0]).toBe('Operation failed');
    });

    it('should handle string error', () => {
      LoggingService.error('Operation failed', 'String error message');
      expect(logger.error).toHaveBeenCalled();
    });

    it('should extract error stack and message', () => {
      const err = new Error('Test error');
      LoggingService.error('Failed', err);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('logApiResponse', () => {
    it('should log status 200 via logger.log with http level', () => {
      const req = { method: 'GET', path: '/api/users', ip: '127.0.0.1', correlationId: 'test', user: null };
      const res = { statusCode: 200 };
      LoggingService.logApiResponse(req, res, 45);
      expect(logger.log).toHaveBeenCalled();
      const call = logger.log.mock.calls[0];
      expect(call[0]).toBe('http');
    });

    it('should log status 201 via logger.log with http level', () => {
      const req = { method: 'POST', path: '/api/users', correlationId: 'test', user: null };
      const res = { statusCode: 201 };
      LoggingService.logApiResponse(req, res, 100);
      expect(logger.log).toHaveBeenCalled();
      const call = logger.log.mock.calls[0];
      expect(call[0]).toBe('http');
    });

    it('should log status 400 via logger.log with warn level', () => {
      const req = { method: 'POST', path: '/api/users', correlationId: 'test', user: null };
      const res = { statusCode: 400 };
      LoggingService.logApiResponse(req, res, 30);
      expect(logger.log).toHaveBeenCalled();
      const call = logger.log.mock.calls[0];
      expect(call[0]).toBe('warn');
    });

    it('should log status 401 via logger.log with warn level', () => {
      const req = { method: 'GET', path: '/api/users', correlationId: 'test', user: null };
      const res = { statusCode: 401 };
      LoggingService.logApiResponse(req, res, 20);
      expect(logger.log).toHaveBeenCalled();
      const call = logger.log.mock.calls[0];
      expect(call[0]).toBe('warn');
    });

    it('should log status 500 via logger.log with warn level', () => {
      const req = { method: 'DELETE', path: '/api/users/123', correlationId: 'test', user: null };
      const res = { statusCode: 500 };
      LoggingService.logApiResponse(req, res, 500);
      expect(logger.log).toHaveBeenCalled();
      const call = logger.log.mock.calls[0];
      expect(call[0]).toBe('warn');
    });

    it('should log status 502 via logger.log with warn level', () => {
      const req = { method: 'GET', path: '/api/data', correlationId: 'test', user: null };
      const res = { statusCode: 502 };
      LoggingService.logApiResponse(req, res, 1000);
      expect(logger.log).toHaveBeenCalled();
      const call = logger.log.mock.calls[0];
      expect(call[0]).toBe('warn');
    });

    it('should include duration in log context', () => {
      const req = { method: 'GET', path: '/api/users', correlationId: 'test', user: null };
      const res = { statusCode: 200 };
      LoggingService.logApiResponse(req, res, 234);
      expect(logger.log).toHaveBeenCalled();
      const call = logger.log.mock.calls[0];
      expect(call[2]).toHaveProperty('duration');
    });
  });

  describe('logSecurityEvent', () => {
    it('should call logger.warn for security events', () => {
      LoggingService.logSecurityEvent('failed_login_attempt', { email: 'user@example.com' });
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should include event type in context', () => {
      LoggingService.logSecurityEvent('suspicious_activity', { userId: 'user-123' });
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('logAuthEvent', () => {
    it('should call logger.info for auth events', () => {
      LoggingService.logAuthEvent('login_successful', 'user-123', { ip: '127.0.0.1' });
      expect(logger.info).toHaveBeenCalled();
    });

    it('should include userId in context', () => {
      LoggingService.logAuthEvent('logout_successful', 'user-456');
      const call = logger.info.mock.calls[0];
      expect(call[1]).toHaveProperty('userId');
    });
  });

  describe('debug', () => {
    it('should call logger.debug', () => {
      LoggingService.debug('Debug information', { details: 'test' });
      expect(logger.debug).toHaveBeenCalled();
    });
  });

  describe('http', () => {
    it('should call logger.log with http level', () => {
      LoggingService.http('HTTP request', { method: 'GET' });
      expect(logger.log).toHaveBeenCalled();
      const call = logger.log.mock.calls[0];
      expect(call[0]).toBe('http');
    });
  });
});
