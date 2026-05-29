# Phase 14: Error Tracking & Sentry Integration

## Overview

Phase 14 implements centralized error tracking using Sentry with:
- **Error Reporting** - Automatic capture of exceptions and errors
- **Performance Monitoring** - Track slow requests and service metrics
- **User Context** - Associate errors with specific users
- **Breadcrumb Tracking** - Understand error context and user actions
- **Release Tracking** - Monitor error patterns across app versions
- **Security Events** - Log and track security-related incidents
- **Custom Integrations** - Database, HTTP, and performance tracking

## Dependencies

```bash
npm install @sentry/node @sentry/tracing
```

- `@sentry/node` — Sentry SDK for Node.js
- `@sentry/tracing` — Performance monitoring

## Configuration

### Environment Variables

```bash
# Sentry DSN (Data Source Name)
SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/0

# Sample rate for transactions (0.0 - 1.0)
SENTRY_TRACES_SAMPLE_RATE=0.1

# Sample rate for performance profiles
SENTRY_PROFILES_SAMPLE_RATE=0.1

# Application version
APP_VERSION=1.0.0
```

### Sentry Setup

1. Create free account at [sentry.io](https://sentry.io)
2. Create new Node.js project
3. Copy DSN from Project Settings
4. Add to `.env` file:

```env
SENTRY_DSN=your-dsn-here
NODE_ENV=production
```

## Components

### 1. Sentry Configuration (`src/config/sentry.js`)

Core Sentry initialization with integrations:

```js
const { Sentry, sentry, getSentryMiddleware, getSentryErrorHandler } = require('./config/sentry');

// Sentry is initialized and ready
```

**Features:**
- Automatic HTTP integration for request tracking
- Express.js integration for middleware support
- PostgreSQL integration for database error tracking
- Performance profiling for slow operations
- Exception and rejection handlers
- Custom beforeSend filter for controlling data

### 2. Error Tracking Service (`src/services/errorTrackingService.js`)

High-level API for error tracking and monitoring:

#### Exception Capture

```js
const ErrorTrackingService = require('./services/errorTrackingService');

try {
  // risky operation
} catch (error) {
  ErrorTrackingService.captureException(error, {
    context: 'user_creation',
    userId: user.id,
  });
}
```

#### Message Capture

```js
ErrorTrackingService.captureMessage(
  'Email sending failed',
  'error',
  { email, reason: 'timeout' }
);
```

#### User Context

```js
// Set user on successful login
ErrorTrackingService.setUser(userId, {
  email: 'user@example.com',
  role: 'admin',
});

// Clear user on logout
ErrorTrackingService.clearUser();
```

#### Breadcrumbs (Audit Trail)

```js
// Breadcrumb added to error context
ErrorTrackingService.addBreadcrumb(
  'API call executed',
  'http',
  'info',
  { endpoint: '/api/v1/users', statusCode: 200 }
);

// Multiple breadcrumbs create event timeline
ErrorTrackingService.addBreadcrumb('Database query started', 'database', 'info');
ErrorTrackingService.addBreadcrumb('Database query completed', 'database', 'debug', { duration: 145 });
```

#### Event-Specific Captures

```js
// Authentication event
ErrorTrackingService.captureAuthEvent('login_successful', userId, {
  ip: '192.168.1.1',
  method: 'email_password',
});

// Security event
ErrorTrackingService.captureSecurityEvent('failed_login_attempt', {
  email,
  ip,
  reason: 'invalid_password',
});

// Validation error
ErrorTrackingService.captureValidationError('email_field', 'Invalid email format', {
  providedValue: 'not-an-email',
});

// Data integrity issue
ErrorTrackingService.captureDataIntegrity('missing_required_field', {
  table: 'users',
  field: 'email',
});
```

#### Performance Tracking

```js
// Capture slow operation
const startTime = Date.now();
await expensiveOperation();
const duration = Date.now() - startTime;

ErrorTrackingService.capturePerformance('user_creation', duration, {
  userId,
  tenantId,
});

// Automatically warns if > 5000ms
```

#### Status Checks

```js
// Check if Sentry is enabled
if (ErrorTrackingService.isEnabled()) {
  // Sentry DSN is configured
}
```

### 3. Middleware Integration

Sentry middleware automatically integrated into Express:

```js
// Request handler (early in middleware chain)
app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.tracingHandler());

// Error handler (after custom error handler)
app.use(Sentry.Handlers.errorHandler());
```

**Captured Data:**
- Request method, path, URL
- Query parameters and body size
- Response status code
- User agent and IP address
- Headers and cookies (sanitized)
- Performance metrics

### 4. Error Handler Integration

Custom error handler captures exceptions:

```js
app.use((err, req, res, next) => {
  // Capture in Sentry
  ErrorTrackingService.captureException(err, {
    correlationId: req.correlationId,
    method: req.method,
    path: req.path,
  });

  // Return error response
  res.status(500).json({ error: 'Internal Server Error' });
});
```

## Event Examples

### Successful Login

```json
{
  "timestamp": "2026-05-29T10:30:45.123Z",
  "level": "info",
  "category": "auth",
  "message": "Authentication event: login_successful",
  "breadcrumbs": [
    {
      "message": "POST /login 200",
      "category": "http",
      "level": "info"
    }
  ],
  "user": {
    "id": "user-123",
    "email": "admin@seekerslab.com",
    "role": "admin"
  },
  "contexts": {
    "custom": {
      "ip": "192.168.1.100",
      "method": "email_password"
    }
  }
}
```

### Failed Login Attempt

```json
{
  "timestamp": "2026-05-29T10:31:12.456Z",
  "level": "warning",
  "message": "Security event: failed_login_attempt",
  "contexts": {
    "custom": {
      "email": "attacker@example.com",
      "ip": "203.0.113.45",
      "reason": "invalid_password"
    }
  },
  "tags": {
    "security_event": "true"
  }
}
```

### Application Error

```json
{
  "timestamp": "2026-05-29T10:32:30.789Z",
  "level": "error",
  "message": "Database connection timeout",
  "exception": {
    "type": "TimeoutError",
    "value": "Connection timeout after 5000ms",
    "stacktrace": "..."
  },
  "breadcrumbs": [
    {
      "message": "Request started",
      "category": "http",
      "level": "info"
    },
    {
      "message": "Database query started",
      "category": "database",
      "level": "info"
    },
    {
      "message": "Connection timeout",
      "category": "database",
      "level": "error"
    }
  ],
  "request": {
    "method": "GET",
    "url": "https://example.com/api/v1/users",
    "headers": {
      "user-agent": "Mozilla/5.0..."
    }
  },
  "user": {
    "id": "user-123",
    "email": "user@example.com"
  }
}
```

## Integration Points

### Authentication Routes

```js
// src/routes/auth.js
ErrorTrackingService.captureAuthEvent('login_successful', userId, {...});
ErrorTrackingService.captureSecurityEvent('failed_login_attempt', {...});
ErrorTrackingService.setUser(userId, {...});
ErrorTrackingService.clearUser();
```

### Error Handler

```js
// src/server.js
app.use(getSentryErrorHandler());
app.use((err, req, res, next) => {
  ErrorTrackingService.captureException(err, {...});
});
```

### Server Lifecycle

```js
// Graceful shutdown with Sentry flush
process.on('SIGTERM', async () => {
  await ErrorTrackingService.flush(5000);
  process.exit(0);
});
```

## Sentry Dashboard Features

### Issue Tracking

- **Error Groups** - Automatic grouping of similar errors
- **Issue Metrics** - Error rate, user impact, first/last seen
- **Assignees** - Assign team members to issues
- **Status** - Resolved, ignored, regressed, ongoing

### Performance Monitoring

- **Slow Transactions** - Requests exceeding thresholds
- **Performance Metrics** - Response time percentiles (p50, p95, p99)
- **Correlations** - Find what causes performance degradation
- **Profiles** - Function-level performance details

### Releases & Deployments

```js
// Set release version
ErrorTrackingService.release('1.0.0');

// Track errors by version
// Sentry groups errors per release
// Monitor if new version has regressions
```

### Alerts & Notifications

Configure in Sentry dashboard:
- Alert on error spike
- Alert on new error type
- Alert on performance regression
- Email, Slack, PagerDuty integrations

## Best Practices

### 1. Always Set User Context on Login

```js
// ✓ Good - user context set on successful login
ErrorTrackingService.setUser(userId, { email, role });

// ✓ Good - user cleared on logout
ErrorTrackingService.clearUser();

// ✗ Wrong - no user context
ErrorTrackingService.captureException(error);
```

### 2. Use Appropriate Log Levels

```js
// ✓ Correct
ErrorTrackingService.captureMessage('User updated', 'info');
ErrorTrackingService.captureMessage('Failed to send email', 'warning');
ErrorTrackingService.captureMessage('Database crashed', 'error');

// ✗ Wrong - overuse of error level
ErrorTrackingService.captureMessage('User logged in', 'error');
```

### 3. Add Meaningful Breadcrumbs

```js
// ✓ Good - enough context to debug
ErrorTrackingService.addBreadcrumb(
  'User creation initiated',
  'user',
  'info',
  { tenantId, email }
);

// ✗ Wrong - not enough context
ErrorTrackingService.addBreadcrumb('Started', 'user', 'info');
```

### 4. Don't Log Sensitive Data

```js
// ✗ Wrong - logs password
ErrorTrackingService.addBreadcrumb('Login', 'auth', 'info', {
  email,
  password,
  token
});

// ✓ Correct - logs only non-sensitive data
ErrorTrackingService.addBreadcrumb('Login attempt', 'auth', 'info', {
  email,
  ip,
  method: 'email_password'
});
```

### 5. Capture Performance Metrics

```js
// ✓ Good - track slow operations
const start = Date.now();
const result = await heavyOperation();
const duration = Date.now() - start;
ErrorTrackingService.capturePerformance('heavy_operation', duration, {
  resultSize: result.length
});
```

## Sample Rate Configuration

### Development

```env
SENTRY_TRACES_SAMPLE_RATE=1.0    # Capture all transactions
SENTRY_PROFILES_SAMPLE_RATE=0.5  # Sample 50% of transactions
```

### Production

```env
SENTRY_TRACES_SAMPLE_RATE=0.1    # Sample 10% of transactions (cost control)
SENTRY_PROFILES_SAMPLE_RATE=0.01 # Sample 1% for profiling
```

## Common Issues

### Sentry DSN Not Configured

```
⚠️  SENTRY_DSN not configured. Error tracking disabled.
```

**Fix:**
1. Add `SENTRY_DSN` to `.env`
2. Get DSN from Sentry project settings
3. Restart application

### Events Not Appearing in Sentry

1. Verify `SENTRY_DSN` is correct
2. Check `NODE_ENV` is not `test`
3. Verify network allows HTTPS to `ingest.sentry.io`
4. Call `ErrorTrackingService.flush()` before shutdown

### Performance Impact

- **Negligible** - Asynchronous event sending
- **Sampled** - Only configured percentage of transactions
- **Configurable** - Adjust sample rates for load
- **Cached** - Events buffered before sending

## Testing Error Tracking

### Manual Testing

```bash
# Start app with Sentry enabled
SENTRY_DSN=your-dsn-here npm run dev

# Trigger errors in another terminal
curl -X POST http://localhost:3000/api/v1/users/invalid

# Check Sentry dashboard for captured events
```

### Disable for Testing

```bash
# Test without Sentry
unset SENTRY_DSN
npm test

# Or explicitly disable
SENTRY_DSN="" npm test
```

## Next Steps

**Phase 15** - Input Validation & Data Schemas
- Request validation schemas
- Error message formatting
- Structured error responses

**Phase 16** - Enhanced API Documentation
- OpenAPI improvements
- Request/response examples
- Error code documentation

**Phase 17** - CI/CD & Deployment
- GitHub Actions workflows
- Automated testing
- Release management

## References

- [Sentry Documentation](https://docs.sentry.io/platforms/node/)
- [Performance Monitoring](https://docs.sentry.io/product/performance/)
- [Release Tracking](https://docs.sentry.io/product/releases/)
- [Breadcrumbs](https://docs.sentry.io/product/enriching-events/breadcrumbs/)
- [Best Practices](https://docs.sentry.io/platforms/node/enriching-events/)
