/**
 * Unit Tests for Error Tracking Service
 * Tests error tracking with Sentry disabled (no SENTRY_DSN)
 */

jest.mock('../../../src/services/loggingService');

describe('ErrorTrackingService (Sentry Disabled)', () => {
  // Ensure SENTRY_DSN is not set
  beforeEach(() => {
    delete process.env.SENTRY_DSN;
    jest.resetModules();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  let ErrorTrackingService;
  let LoggingService;

  beforeEach(() => {
    LoggingService = require('../../../src/services/loggingService');
    ErrorTrackingService = require('../../../src/services/errorTrackingService');
  });

  describe('isEnabled', () => {
    it('should return false when SENTRY_DSN not set', () => {
      expect(ErrorTrackingService.isEnabled()).toBe(false);
    });
  });

  describe('captureException', () => {
    it('should fall back to LoggingService.error when Sentry disabled', () => {
      const error = new Error('Test error');
      ErrorTrackingService.captureException(error, { context: 'test' });
      expect(LoggingService.error).toHaveBeenCalled();
    });

    it('should pass error and context to LoggingService', () => {
      const error = new Error('Database error');
      const context = { query: 'SELECT * FROM users' };
      ErrorTrackingService.captureException(error, context);
      expect(LoggingService.error).toHaveBeenCalledWith(
        expect.any(String),
        error,
        expect.objectContaining(context)
      );
    });

    it('should handle string errors', () => {
      ErrorTrackingService.captureException('String error', { context: 'test' });
      expect(LoggingService.error).toHaveBeenCalled();
    });
  });

  describe('captureMessage', () => {
    it('should not throw when Sentry disabled', () => {
      expect(() => {
        ErrorTrackingService.captureMessage('Test message', 'info', {});
      }).not.toThrow();
    });
  });

  describe('setUser', () => {
    it('should be a no-op when Sentry disabled', () => {
      expect(() => {
        ErrorTrackingService.setUser('user-123', { email: 'user@example.com' });
      }).not.toThrow();
    });
  });

  describe('clearUser', () => {
    it('should be a no-op when Sentry disabled', () => {
      expect(() => {
        ErrorTrackingService.clearUser();
      }).not.toThrow();
    });
  });

  describe('setContext', () => {
    it('should be a no-op when Sentry disabled', () => {
      expect(() => {
        ErrorTrackingService.setContext('request', { method: 'POST' });
      }).not.toThrow();
    });
  });

  describe('clearContext', () => {
    it('should be a no-op when Sentry disabled', () => {
      expect(() => {
        ErrorTrackingService.clearContext('request');
      }).not.toThrow();
    });
  });

  describe('addBreadcrumb', () => {
    it('should be a no-op when Sentry disabled', () => {
      expect(() => {
        ErrorTrackingService.addBreadcrumb('API call', 'http', 'info', { endpoint: '/api/users' });
      }).not.toThrow();
    });
  });

  describe('startTransaction', () => {
    it('should return null when Sentry disabled', () => {
      const transaction = ErrorTrackingService.startTransaction('operation', 'test');
      expect(transaction).toBeNull();
    });
  });

  describe('capturePerformance', () => {
    it('should be a no-op when Sentry disabled', () => {
      expect(() => {
        ErrorTrackingService.capturePerformance('operation', 3000, {});
      }).not.toThrow();
    });

    it('should be a no-op for slow operations when Sentry disabled', () => {
      expect(() => {
        ErrorTrackingService.capturePerformance('slow_query', 6000, {});
      }).not.toThrow();
    });

    it('should not call LoggingService methods when Sentry disabled', () => {
      ErrorTrackingService.capturePerformance('operation', 5000, {});
      expect(LoggingService.warn).not.toHaveBeenCalled();
      expect(LoggingService.info).not.toHaveBeenCalled();
    });
  });

  describe('captureApiRequest', () => {
    it('should be a no-op when Sentry disabled', () => {
      const req = { method: 'GET', path: '/api/users' };
      const res = { statusCode: 200 };
      expect(() => {
        ErrorTrackingService.captureApiRequest(req, res);
      }).not.toThrow();
    });
  });

  describe('captureAuthEvent', () => {
    it('should be a no-op when Sentry disabled', () => {
      expect(() => {
        ErrorTrackingService.captureAuthEvent('login_successful', 'user-123', {});
      }).not.toThrow();
    });
  });

  describe('captureSecurityEvent', () => {
    it('should be a no-op when Sentry disabled', () => {
      expect(() => {
        ErrorTrackingService.captureSecurityEvent('failed_login_attempt', {});
      }).not.toThrow();
    });
  });

  describe('captureValidationError', () => {
    it('should be a no-op when Sentry disabled', () => {
      expect(() => {
        ErrorTrackingService.captureValidationError('email', 'Invalid email', {});
      }).not.toThrow();
    });
  });

  describe('captureDataIntegrity', () => {
    it('should be a no-op when Sentry disabled', () => {
      expect(() => {
        ErrorTrackingService.captureDataIntegrity('missing_field', {});
      }).not.toThrow();
    });
  });

  describe('release', () => {
    it('should be a no-op when Sentry disabled', () => {
      expect(() => {
        ErrorTrackingService.release('1.0.0');
      }).not.toThrow();
    });
  });

  describe('flush', () => {
    it('should resolve without error when Sentry disabled', async () => {
      const result = await ErrorTrackingService.flush(5000);
      expect(result).toBeUndefined();
    });

    it('should handle flush with any timeout', async () => {
      await expect(ErrorTrackingService.flush(1000)).resolves.not.toThrow();
    });
  });
});
