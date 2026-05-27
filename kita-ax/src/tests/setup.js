// Test setup and configuration
// Suppress console output during tests unless explicitly needed
if (process.env.DEBUG !== 'true') {
  global.console.log = jest.fn();
  global.console.warn = jest.fn();
}

// Set test environment
process.env.NODE_ENV = 'test';
