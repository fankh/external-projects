/**
 * Unit Tests for Joi Validation Schemas
 * Tests all request validation schemas used throughout the application
 */

const schemas = require('../../../src/schemas/validationSchemas');

describe('Validation Schemas', () => {
  // ===== LOGIN SCHEMA =====
  describe('loginSchema', () => {
    const schema = schemas.loginSchema;

    it('should validate correct login credentials', () => {
      const { error } = schema.validate({
        email: 'user@example.com',
        password: 'password123'
      });
      expect(error).toBeUndefined();
    });

    it('should reject missing email', () => {
      const { error } = schema.validate({
        password: 'password123'
      });
      expect(error).toBeDefined();
      expect(error.message).toContain('email');
    });

    it('should reject invalid email format', () => {
      const { error } = schema.validate({
        email: 'not-an-email',
        password: 'password123'
      });
      expect(error).toBeDefined();
    });

    it('should reject missing password', () => {
      const { error } = schema.validate({
        email: 'user@example.com'
      });
      expect(error).toBeDefined();
      expect(error.message).toContain('password');
    });

    it('should reject password shorter than 6 characters', () => {
      const { error } = schema.validate({
        email: 'user@example.com',
        password: 'short'
      });
      expect(error).toBeDefined();
      expect(error.message).toContain('6');
    });
  });

  // ===== TWO FACTOR VERIFY SCHEMA =====
  describe('twoFactorVerifySchema', () => {
    const schema = schemas.twoFactorVerifySchema;

    it('should validate 6-digit token', () => {
      const { error } = schema.validate({
        token: '123456'
      });
      expect(error).toBeUndefined();
    });

    it('should reject non-digit characters', () => {
      const { error } = schema.validate({
        token: '12345a'
      });
      expect(error).toBeDefined();
    });

    it('should reject token shorter than 6 digits', () => {
      const { error } = schema.validate({
        token: '12345'
      });
      expect(error).toBeDefined();
    });

    it('should reject token longer than 6 digits', () => {
      const { error } = schema.validate({
        token: '1234567'
      });
      expect(error).toBeDefined();
    });

    it('should reject missing token', () => {
      const { error } = schema.validate({});
      expect(error).toBeDefined();
    });
  });

  // ===== TWO FACTOR SETUP SCHEMA =====
  describe('twoFactorSetupSchema', () => {
    const schema = schemas.twoFactorSetupSchema;

    it('should validate valid token and secret', () => {
      const { error } = schema.validate({
        token: '123456',
        secret: 'ABCDEFGHIJKLMNOP'
      });
      expect(error).toBeUndefined();
    });

    it('should reject missing secret', () => {
      const { error } = schema.validate({
        token: '123456'
      });
      expect(error).toBeDefined();
      expect(error.message).toContain('secret');
    });

    it('should reject invalid token format', () => {
      const { error } = schema.validate({
        token: 'abcdef',
        secret: 'ABCDEFGHIJKLMNOP'
      });
      expect(error).toBeDefined();
    });
  });

  // ===== USER CREATE SCHEMA =====
  describe('userCreateSchema', () => {
    const schema = schemas.userCreateSchema;

    it('should validate correct user creation data', () => {
      const { error } = schema.validate({
        email: 'newuser@example.com',
        password: 'SecurePass123',
        role: 'editor'
      });
      expect(error).toBeUndefined();
    });

    it('should reject password without uppercase letter', () => {
      const { error } = schema.validate({
        email: 'newuser@example.com',
        password: 'securepass123'
      });
      expect(error).toBeDefined();
      expect(error.message).toContain('uppercase');
    });

    it('should reject password without lowercase letter', () => {
      const { error } = schema.validate({
        email: 'newuser@example.com',
        password: 'SECUREPASS123'
      });
      expect(error).toBeDefined();
      expect(error.message).toContain('lowercase');
    });

    it('should reject password without number', () => {
      const { error } = schema.validate({
        email: 'newuser@example.com',
        password: 'SecurePass'
      });
      expect(error).toBeDefined();
      expect(error.message).toContain('numbers');
    });

    it('should reject invalid role', () => {
      const { error } = schema.validate({
        email: 'newuser@example.com',
        password: 'SecurePass123',
        role: 'superadmin'
      });
      expect(error).toBeDefined();
    });

    it('should allow optional name field', () => {
      const { error } = schema.validate({
        email: 'newuser@example.com',
        password: 'SecurePass123',
        name: 'John Doe'
      });
      expect(error).toBeUndefined();
    });

    it('should allow omitting optional fields', () => {
      const { error } = schema.validate({
        email: 'newuser@example.com',
        password: 'SecurePass123'
      });
      expect(error).toBeUndefined();
    });
  });

  // ===== PASSWORD CHANGE SCHEMA =====
  describe('passwordChangeSchema', () => {
    const schema = schemas.passwordChangeSchema;

    it('should validate matching new and confirm passwords', () => {
      const { error } = schema.validate({
        currentPassword: 'OldPass123',
        newPassword: 'NewPass456',
        confirmPassword: 'NewPass456'
      });
      expect(error).toBeUndefined();
    });

    it('should reject new password same as current', () => {
      const { error } = schema.validate({
        currentPassword: 'SamePass123',
        newPassword: 'SamePass123',
        confirmPassword: 'SamePass123'
      });
      expect(error).toBeDefined();
      expect(error.message).toContain('different');
    });

    it('should reject mismatched confirm password', () => {
      const { error } = schema.validate({
        currentPassword: 'OldPass123',
        newPassword: 'NewPass456',
        confirmPassword: 'NewPass789'
      });
      expect(error).toBeDefined();
      expect(error.message).toContain('confirmation');
    });

    it('should reject new password without uppercase', () => {
      const { error } = schema.validate({
        currentPassword: 'OldPass123',
        newPassword: 'newpass456',
        confirmPassword: 'newpass456'
      });
      expect(error).toBeDefined();
    });

    it('should reject new password shorter than 8 chars', () => {
      const { error } = schema.validate({
        currentPassword: 'OldPass123',
        newPassword: 'New123',
        confirmPassword: 'New123'
      });
      expect(error).toBeDefined();
    });
  });

  // ===== DOCUMENT SCHEMAS =====
  describe('documentCreateSchema', () => {
    const schema = schemas.documentCreateSchema;

    it('should validate document with all fields', () => {
      const { error } = schema.validate({
        title: 'Important Document',
        content: 'Document content here',
        category: 'Financial',
        tags: ['finance', 'quarterly'],
        status: 'published'
      });
      expect(error).toBeUndefined();
    });

    it('should reject title shorter than 3 characters', () => {
      const { error } = schema.validate({
        title: 'ab',
        content: 'Content'
      });
      expect(error).toBeDefined();
    });

    it('should reject title longer than 255 characters', () => {
      const { error } = schema.validate({
        title: 'a'.repeat(256),
        content: 'Content'
      });
      expect(error).toBeDefined();
    });

    it('should reject invalid status', () => {
      const { error } = schema.validate({
        title: 'Valid Title',
        status: 'pending'
      });
      expect(error).toBeDefined();
    });

    it('should allow omitting optional fields', () => {
      const { error } = schema.validate({
        title: 'Valid Document'
      });
      expect(error).toBeUndefined();
    });
  });

  // ===== PAGINATION SCHEMA =====
  describe('paginationSchema', () => {
    const schema = schemas.paginationSchema;

    it('should validate valid pagination parameters', () => {
      const { error } = schema.validate({
        page: 2,
        limit: 20,
        sort: 'createdAt',
        order: 'desc'
      });
      expect(error).toBeUndefined();
    });

    it('should reject page less than 1', () => {
      const { error } = schema.validate({
        page: 0
      });
      expect(error).toBeDefined();
    });

    it('should reject limit of 0', () => {
      const { error } = schema.validate({
        limit: 0
      });
      expect(error).toBeDefined();
    });

    it('should reject limit greater than 100', () => {
      const { error } = schema.validate({
        limit: 101
      });
      expect(error).toBeDefined();
    });

    it('should reject invalid sort order', () => {
      const { error } = schema.validate({
        order: 'sideways'
      });
      expect(error).toBeDefined();
    });

    it('should allow omitting all parameters', () => {
      const { error } = schema.validate({});
      expect(error).toBeUndefined();
    });
  });

  // ===== PREFERENCES SCHEMA =====
  describe('preferencesUpdateSchema', () => {
    const schema = schemas.preferencesUpdateSchema;

    it('should validate theme preference', () => {
      const { error } = schema.validate({
        theme: 'dark'
      });
      expect(error).toBeUndefined();
    });

    it('should reject invalid theme', () => {
      const { error } = schema.validate({
        theme: 'neon'
      });
      expect(error).toBeDefined();
    });

    it('should validate language preference', () => {
      const { error } = schema.validate({
        language: 'ko'
      });
      expect(error).toBeUndefined();
    });

    it('should validate notification settings', () => {
      const { error } = schema.validate({
        notifications: {
          email: true,
          push: false,
          sms: true
        }
      });
      expect(error).toBeUndefined();
    });

    it('should allow all optional fields omitted', () => {
      const { error } = schema.validate({});
      expect(error).toBeUndefined();
    });
  });

  // ===== OAUTH CALLBACK SCHEMA =====
  describe('oauthCallbackSchema', () => {
    const schema = schemas.oauthCallbackSchema;

    it('should validate OAuth callback parameters', () => {
      const { error } = schema.validate({
        code: 'auth_code_12345',
        state: 'state_value_xyz'
      });
      expect(error).toBeUndefined();
    });

    it('should reject missing code', () => {
      const { error } = schema.validate({
        state: 'state_value'
      });
      expect(error).toBeDefined();
      expect(error.message).toContain('code');
    });

    it('should reject missing state', () => {
      const { error } = schema.validate({
        code: 'auth_code'
      });
      expect(error).toBeDefined();
      expect(error.message).toContain('state');
    });
  });
});
