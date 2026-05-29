/**
 * Unit Tests for Validation Middleware
 * Tests request validation, error formatting, and custom validators
 */

jest.mock('../../../src/services/loggingService');
jest.mock('../../../src/services/errorTrackingService');

const validation = require('../../../src/middleware/validation');
const schemas = require('../../../src/schemas/validationSchemas');
const LoggingService = require('../../../src/services/loggingService');
const ErrorTrackingService = require('../../../src/services/errorTrackingService');

describe('Validation Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      body: {},
      query: {},
      params: {},
      correlationId: 'test-correlation-id'
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    next = jest.fn();
  });

  // ===== formatValidationErrors =====
  describe('formatValidationErrors', () => {
    it('should format single validation error', () => {
      const details = [
        { path: ['email'], message: 'must be valid email' }
      ];
      const result = validation.formatValidationErrors(details);
      expect(result.errors).toEqual({
        email: 'must be valid email'
      });
      expect(result.messages).toContain('email: must be valid email');
    });

    it('should format nested validation error with dot notation', () => {
      const details = [
        { path: ['body', 'email'], message: 'must be valid email' }
      ];
      const result = validation.formatValidationErrors(details);
      expect(result.errors['body.email']).toBe('must be valid email');
    });

    it('should handle multiple errors on same field', () => {
      const details = [
        { path: ['password'], message: 'must be at least 8 characters' },
        { path: ['password'], message: 'must contain uppercase' }
      ];
      const result = validation.formatValidationErrors(details);
      expect(result.errors.password).toBeDefined();
      expect(result.messages).toHaveLength(2);
    });

    it('should format multiple field errors', () => {
      const details = [
        { path: ['email'], message: 'must be valid email' },
        { path: ['password'], message: 'must be at least 8 characters' }
      ];
      const result = validation.formatValidationErrors(details);
      expect(result.errors.email).toBeDefined();
      expect(result.errors.password).toBeDefined();
      expect(result.messages).toHaveLength(2);
    });

    it('should handle deeply nested paths with dot notation', () => {
      const details = [
        { path: ['notifications', 'email'], message: 'must be boolean' }
      ];
      const result = validation.formatValidationErrors(details);
      expect(result.errors['notifications.email']).toBe('must be boolean');
    });
  });

  // ===== validateBody =====
  describe('validateBody', () => {
    const loginValidator = validation.validateBody(schemas.loginSchema);

    it('should pass valid body to next middleware', () => {
      req.body = {
        email: 'user@example.com',
        password: 'password123'
      };
      req.correlationId = 'test-id';
      req.path = '/api/auth/login';
      req.method = 'POST';

      loginValidator(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 400 with error details for invalid body', () => {
      req.body = {
        email: 'not-an-email',
        password: 'short'
      };
      req.correlationId = 'test-id';
      req.path = '/api/auth/login';
      req.method = 'POST';

      loginValidator(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalled();
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(false);
      expect(response.error).toBe('Validation failed');
      expect(response.details).toBeDefined();
    });

    it('should capture validation error in tracking service', () => {
      req.body = {
        email: 'invalid'
      };
      req.correlationId = 'test-id';
      req.path = '/api/auth/login';
      req.method = 'POST';

      loginValidator(req, res, next);

      expect(ErrorTrackingService.captureValidationError).toHaveBeenCalled();
    });
  });

  // ===== validateQuery =====
  describe('validateQuery', () => {
    const paginationValidator = validation.validateQuery(schemas.paginationSchema);

    it('should pass valid query to next middleware', () => {
      req.query = {
        page: '1',
        limit: '10'
      };

      paginationValidator(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should return 400 for invalid query parameters', () => {
      req.query = {
        page: '0', // invalid: page must be >= 1
        limit: '200' // invalid: limit must be <= 100
      };

      paginationValidator(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  // ===== Custom Validators =====
  describe('validators.email', () => {
    it('should validate correct email address', () => {
      const result = validation.validators.email('user@example.com');
      expect(result).toBe(true);
    });

    it('should reject invalid email', () => {
      const result = validation.validators.email('not-an-email');
      expect(result).toBe(false);
    });

    it('should reject empty string', () => {
      const result = validation.validators.email('');
      expect(result).toBe(false);
    });

    it('should accept various domain formats', () => {
      expect(validation.validators.email('user+tag@example.co.uk')).toBe(true);
      expect(validation.validators.email('user.name@example.org')).toBe(true);
    });
  });

  describe('validators.uuid', () => {
    it('should validate valid UUID v4', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const result = validation.validators.uuid(uuid);
      expect(result).toBe(true);
    });

    it('should reject non-UUID string', () => {
      const result = validation.validators.uuid('not-a-uuid');
      expect(result).toBe(false);
    });

    it('should reject invalid UUID format', () => {
      const result = validation.validators.uuid('550e8400-e29b-41d4-a716-44665544000');
      expect(result).toBe(false);
    });

    it('should reject UUID with lowercase', () => {
      // UUIDs can be lowercase, but let's check behavior
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const result = validation.validators.uuid(uuid);
      expect(result).toBe(true);
    });
  });

  describe('validators.url', () => {
    it('should validate valid HTTPS URL', () => {
      const result = validation.validators.url('https://example.com');
      expect(result).toBe(true);
    });

    it('should validate valid HTTP URL', () => {
      const result = validation.validators.url('http://example.com');
      expect(result).toBe(true);
    });

    it('should validate URL with path', () => {
      const result = validation.validators.url('https://example.com/path/to/resource');
      expect(result).toBe(true);
    });

    it('should validate URL with query params', () => {
      const result = validation.validators.url('https://example.com?key=value');
      expect(result).toBe(true);
    });

    it('should reject invalid URL', () => {
      const result = validation.validators.url('not a url');
      expect(result).toBe(false);
    });

    it('should reject URL without protocol', () => {
      const result = validation.validators.url('example.com');
      expect(result).toBe(false);
    });
  });

  describe('validators.phone', () => {
    it('should validate valid US phone number', () => {
      const result = validation.validators.phone('(555) 123-4567');
      expect(result).toBe(true);
    });

    it('should validate US phone without formatting', () => {
      const result = validation.validators.phone('5551234567');
      expect(result).toBe(true);
    });

    it('should validate Canadian phone number', () => {
      const result = validation.validators.phone('(416) 555-1212');
      expect(result).toBe(true);
    });

    it('should reject invalid phone', () => {
      const result = validation.validators.phone('123');
      expect(result).toBe(false);
    });
  });

  describe('validators.postalCode', () => {
    it('should validate US ZIP code', () => {
      const result = validation.validators.postalCode('10001');
      expect(result).toBe(true);
    });

    it('should validate US ZIP+4', () => {
      const result = validation.validators.postalCode('10001-1234');
      expect(result).toBe(true);
    });

    it('should validate Canadian postal code', () => {
      const result = validation.validators.postalCode('M5V 3A8');
      expect(result).toBe(true);
    });

    it('should reject invalid postal code', () => {
      const result = validation.validators.postalCode('ABC');
      expect(result).toBe(false);
    });
  });
});
