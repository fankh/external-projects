/**
 * Jest Setup for KYRA Admin Console Tests
 * Configures test environment, mocks, and utilities
 */

require('dotenv').config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

// Mock Redis for session testing
jest.mock('redis', () => ({
  createClient: jest.fn().mockReturnValue({
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
  }),
}));

// Global test utilities
global.testUtils = {
  // Generate test data
  generateUser: (overrides = {}) => ({
    id: 'test-user-id',
    email: 'test@example.com',
    passwordHash: 'hashedpassword',
    role: 'admin',
    tenantId: 'test-tenant-id',
    status: 'active',
    lastLogin: new Date(),
    totpEnabled: false,
    totpSecret: null,
    totpBackupCodes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),

  generateDocument: (overrides = {}) => ({
    id: 'test-doc-id',
    title: 'Test Document',
    classification: 'internal',
    owner: 'test@example.com',
    tenantId: 'test-tenant-id',
    accessCount: 0,
    size: 1024,
    description: 'Test document description',
    filePath: '/uploads/test.pdf',
    fileName: 'test.pdf',
    fileMimeType: 'application/pdf',
    fileSize: 1024,
    uploadedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),

  generateSession: (overrides = {}) => ({
    userId: 'test-user-id',
    email: 'test@example.com',
    role: 'admin',
    tenantId: 'test-tenant-id',
    name: 'Test User',
    ...overrides,
  }),

  // Test constants
  TEST_EMAIL: 'test@example.com',
  TEST_PASSWORD: 'TestPassword123!',
  TEST_TENANT_ID: 'test-tenant-id',
  TEST_USER_ID: 'test-user-id',
};

// Increase timeout for integration tests
jest.setTimeout(10000);

// Suppress console output in tests unless debugging
if (process.env.DEBUG !== 'true') {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  };
}
