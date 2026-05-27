module.exports = {
  testEnvironment: 'node',
  rootDir: '.',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/server.js'
  ],
  testMatch: [
    '**/tests/**/*.test.js'
  ],
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup.js'],
  verbose: true,
  testTimeout: 10000,
  modulePathIgnorePatterns: ['node_modules']
};
