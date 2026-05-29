# Phase 12: Comprehensive Unit & Integration Tests

## Overview

Phase 12 implements a comprehensive testing strategy covering:
- **Unit Tests** - Service and middleware logic
- **Integration Tests** - API endpoints and authentication flows
- **E2E Tests** - User workflows (from Phase 11)
- **Test Coverage** - Minimum 70% code coverage target

## Test Structure

```
tests/
├── setup.js                          # Jest setup and global utilities
├── unit/
│   ├── services/
│   │   ├── twoFactorService.test.js # 2FA service tests
│   │   ├── userService.test.js      # User service tests
│   │   └── ...
│   ├── middleware/
│   │   ├── auth.test.js             # Authentication middleware tests
│   │   ├── security.test.js         # Security middleware tests
│   │   └── ...
│   └── utils/
│       └── ...
├── integration/
│   ├── api/
│   │   ├── health.test.js           # Health check endpoints
│   │   ├── auth.test.js             # Authentication flows
│   │   ├── protected.test.js        # Protected endpoint tests
│   │   ├── users.test.js            # User API tests
│   │   └── ...
│   └── database/
│       └── ...
└── e2e/
    ├── phase11-direct.spec.js       # 2FA E2E tests
    ├── phase11-staging.spec.js      # Staging tests
    └── ...
```

## Unit Tests

### TwoFactorService (`tests/unit/services/twoFactorService.test.js`)

Tests for TOTP secret generation, token verification, and backup code management:

- ✅ `generateSecret()` - TOTP secret with QR code generation
- ✅ `verifyToken()` - Valid/invalid token verification
- ✅ `hashBackupCodes()` - Backup code hashing
- ✅ `verifyBackupCode()` - Backup code verification and removal
- ✅ `enableTotp()` - Enable TOTP for user
- ✅ `disableTotp()` - Disable TOTP for user
- ✅ `isTwoFactorEnabled()` - Check 2FA status

**Key Coverage:**
- Edge cases (null/empty values)
- Token verification timing window
- Backup code removal on use
- Database update calls

### Authentication Middleware (`tests/unit/middleware/auth.test.js`)

Tests for authentication and authorization middleware:

- ✅ `requireAuth()` - Session validation and attachment
- ✅ `requireAdmin()` - Admin role verification
- ✅ `optionalAuth()` - Optional authentication
- ✅ `requireTwoFactor()` - 2FA enforcement

**Key Coverage:**
- Session presence/absence
- User role validation
- API vs page request detection
- Redirect vs JSON error responses
- 2FA pending state handling

## Integration Tests

### Health & OpenAPI (`tests/integration/api/health.test.js`)

Tests for public endpoints and API documentation:

- ✅ `GET /health` - Health check endpoint
- ✅ `GET /api/openapi.json` - OpenAPI specification
- ✅ `GET /api/docs` - Swagger UI
- ✅ 404 handling for unknown routes

### Authentication (`tests/integration/api/auth.test.js`)

Tests for login, logout, and OAuth flows:

- ✅ `GET /login` - Login page rendering
- ✅ `POST /login` - Login validation and processing
- ✅ `POST /logout` - Session clearing
- ✅ `GET/POST /auth/2fa/*` - 2FA routes
- ✅ `GET /auth/google` - Google OAuth
- ✅ `GET /auth/github` - GitHub OAuth
- ✅ Rate limiting on login attempts

**Key Coverage:**
- Credential validation
- Session management
- CSRF tokens
- OAuth provider integration
- Rate limiting

### Protected Endpoints (`tests/integration/api/protected.test.js`)

Tests for authenticated API endpoints:

- ✅ `GET /api/v1/users` - API authentication
- ✅ `GET /admin/dashboard` - Admin authentication
- ✅ `GET /admin/settings` - Settings page authentication
- ✅ Authentication headers handling
- ✅ CSRF protection validation
- ✅ Error response formatting

**Key Coverage:**
- 401 responses for unauthenticated requests
- JSON error responses for API
- Redirect behavior for pages
- CSRF token validation

## Running Tests

### Install Dependencies
```bash
npm install
```

### Run All Tests
```bash
npm test
```

### Run Tests with Coverage
```bash
npm test -- --coverage
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

### Run Specific Test File
```bash
npm test -- tests/unit/middleware/auth.test.js
```

### Run E2E Tests
```bash
npm run test:e2e
```

## Test Coverage Goals

| Component | Target | Status |
|-----------|--------|--------|
| Services | 80%+ | In Progress |
| Middleware | 90%+ | In Progress |
| Routes | 70%+ | In Progress |
| Overall | 70%+ | In Progress |

## CI/CD Integration

Tests are configured to run in CI/CD pipelines:

```yaml
# GitHub Actions / GitLab CI
- Run: npm test
- Generate coverage report
- Upload to code coverage service
- Fail build if coverage drops below threshold
```

## Testing Best Practices

### 1. Test Isolation
- Each test is independent
- Mock external dependencies
- Clean up after each test

### 2. Meaningful Assertions
- Test behavior, not implementation
- Use descriptive test names
- One assertion per test when possible

### 3. Setup and Teardown
- Use `beforeEach` and `afterEach`
- Mock database calls
- Mock external services

### 4. Error Cases
- Test success paths
- Test error paths
- Test edge cases

## Next Steps

1. **Phase 13** - Logging Infrastructure (Winston)
   - Structure log output
   - Implement log levels
   - Configure log rotation

2. **Phase 14** - Error Tracking (Sentry)
   - Error reporting
   - Performance monitoring
   - Release tracking

3. **Phase 15** - Input Validation
   - Request validation schemas
   - Error messages
   - Sanitization

## References

- [Jest Documentation](https://jestjs.io/)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Playwright Documentation](https://playwright.dev/)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
