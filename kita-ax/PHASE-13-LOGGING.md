# Phase 13: Logging Infrastructure (Winston)

## Overview

Phase 13 implements comprehensive logging infrastructure using Winston logger with:
- **Structured Logging** - JSON formatted logs with metadata
- **Request Correlation IDs** - Trace requests across the system
- **Performance Logging** - Track slow requests and service metrics
- **Log Rotation** - Daily log files with 14-day retention
- **Error Tracking** - Centralized error handler with stack traces
- **Security Events** - Log authentication and authorization events

## Dependencies

```bash
npm install winston winston-daily-rotate-file express-winston uuid
```

- `winston` — Logging library with multiple transports
- `winston-daily-rotate-file` — Automatic log rotation by date
- `express-winston` — Express.js middleware for request logging
- `uuid` — Generate unique correlation IDs

## Log Structure

### Logs Directory

```
logs/
├── application-YYYY-MM-DD.log    # Application logs (info level)
├── error-YYYY-MM-DD.log          # Error logs
├── exceptions-YYYY-MM-DD.log     # Uncaught exceptions
├── rejections-YYYY-MM-DD.log     # Unhandled promise rejections
```

**Features:**
- 20MB max file size (rotated immediately)
- 14-day retention (older files archived as .gz)
- Separate error logs for easy filtering

### Log Levels

| Level | Priority | Usage |
|-------|----------|-------|
| `error` | 0 | Errors and exceptions |
| `warn` | 1 | Security events, slow requests |
| `info` | 2 | Authentication, startup, general info |
| `http` | 3 | Request/response details |
| `debug` | 4 | Service calls, database queries |

## Components

### 1. Logger Configuration (`src/config/logger.js`)

Winston logger with console and file transports:

```js
const logger = require('./config/logger');
logger.info('Message', { metadata: 'object' });
logger.error('Error message', error);
```

**Console Output (Development):**
```
2026-05-29 10:30:45:123 [info]: Application started { timestamp: '...' }
```

**File Output (JSON):**
```json
{
  "timestamp": "2026-05-29 10:30:45:123",
  "level": "info",
  "message": "Application started",
  "metadata": "object"
}
```

### 2. Logging Service (`src/services/loggingService.js`)

High-level logging API with specialized methods:

#### Basic Logging

```js
const LoggingService = require('./services/loggingService');

LoggingService.info('User created', { userId: '123', email: 'user@example.com' });
LoggingService.warn('Slow query', { duration: 1500, query: '...' });
LoggingService.error('Database error', error, { correlationId: '...' });
LoggingService.debug('Service called', { service: 'UserService', method: 'getById' });
```

#### Specialized Methods

```js
// Create context for logging
const context = LoggingService.createContextLog(correlationId, userId, tenantId);

// Log API requests
LoggingService.logApiRequest(req);
LoggingService.logApiResponse(req, res, durationMs);

// Log security events
LoggingService.logSecurityEvent('login_failed', { email, ip, reason });
LoggingService.logAuthEvent('2fa_verified', userId, { method: 'totp' });

// Log service calls
LoggingService.logServiceCall('UserService', 'getById', durationMs);

// Log database queries
LoggingService.logDatabaseQuery(sqlQuery, durationMs);
```

### 3. Correlation ID Middleware (`src/middleware/correlationId.js`)

Generates unique ID for each request to trace across logs:

```js
app.use(correlationIdMiddleware);
// req.correlationId = 'uuid' (from header or generated)
// Response includes: X-Correlation-ID header
```

**Usage in Logs:**
```json
{
  "correlationId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "method": "POST",
  "path": "/login"
}
```

### 4. Request Logger Middleware (`src/middleware/requestLogger.js`)

Logs incoming requests and outgoing responses:

```
[http] POST /login 200 - 125ms
```

**Logged Data:**
- Method, path, status code
- Response body size
- User ID and tenant ID (if authenticated)
- IP address and user agent

### 5. Performance Logger Middleware (`src/middleware/performanceLogger.js`)

Tracks request duration and warns about slow requests:

```
[warn] Slow request detected: POST /api/v1/documents 2500ms
```

**Thresholds:**
- ⚠️ Warn if > 1000ms (1 second)
- 📊 Debug logs for all requests (if LOG_LEVEL=debug)

## Configuration

### Environment Variables

```bash
# Set log level (error, warn, info, http, debug)
LOG_LEVEL=info

# Production settings
NODE_ENV=production
```

### Log Level Examples

**LOG_LEVEL=error:** Only errors
**LOG_LEVEL=warn:** Errors and security events
**LOG_LEVEL=info:** + Authentication events and startup (default)
**LOG_LEVEL=http:** + All request/response logs
**LOG_LEVEL=debug:** + Service calls and database queries

## Integration Points

### Authentication Routes (`src/routes/auth.js`)

- `login_failed` - Invalid password, inactive account
- `login_successful` - User authenticated
- `logout_successful` - Session cleared
- `2fa_verified` - TOTP/backup code accepted
- `2fa_failed` - Invalid 2FA code

**Example Log:**
```json
{
  "eventType": "login_failed",
  "correlationId": "a1b2c3d4...",
  "email": "user@example.com",
  "ip": "192.168.1.1",
  "reason": "invalid_password"
}
```

### Error Handler (`src/server.js`)

Logs all errors with stack traces:

```json
{
  "level": "error",
  "message": "Request error",
  "correlationId": "a1b2c3d4...",
  "method": "POST",
  "path": "/api/v1/users",
  "statusCode": 500,
  "error": {
    "message": "Database connection failed",
    "stack": "..."
  }
}
```

### Server Startup (`src/server.js`)

```
[info] ✓ Database connection successful
[info] ✓ Database models synchronized
[info] KYRA Admin Console - Server Started on https://localhost:8443
```

## Example Log Files

### application-2026-05-29.log (line 1)

```json
{
  "timestamp": "2026-05-29 10:30:45:123",
  "level": "info",
  "message": "Database connection successful",
  "timestamp": "2026-05-29T10:30:45.123Z"
}
{
  "timestamp": "2026-05-29 10:30:46:234",
  "level": "info",
  "message": "Authentication event: login_successful",
  "eventType": "login_successful",
  "userId": "user-123",
  "timestamp": "2026-05-29T10:30:46.234Z",
  "email": "admin@seekerslab.com",
  "ip": "192.168.1.100"
}
{
  "timestamp": "2026-05-29 10:30:47:100",
  "level": "http",
  "message": "GET /admin/dashboard 200",
  "correlationId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "method": "GET",
  "path": "/admin/dashboard",
  "statusCode": 200,
  "duration": "145ms"
}
```

### error-2026-05-29.log

```json
{
  "timestamp": "2026-05-29 10:31:15:567",
  "level": "error",
  "message": "Request error",
  "correlationId": "xyz789...",
  "method": "POST",
  "path": "/api/v1/users",
  "statusCode": 500,
  "error": {
    "message": "Connection timeout",
    "stack": "Error: Connection timeout\n  at ...",
    "name": "TimeoutError"
  }
}
```

## Best Practices

### 1. Always Include Correlation ID

```js
LoggingService.info('User created', {
  correlationId: req.correlationId,  // ✓ Always include
  userId: user.id,
  email: user.email
});
```

### 2. Use Appropriate Log Levels

```js
// ✗ Wrong: info for errors
LoggingService.info('Failed to save user', error);

// ✓ Correct: error level with error object
LoggingService.error('Failed to save user', error);
```

### 3. Log Security Events Explicitly

```js
// ✓ Good: explicit security event
LoggingService.logSecurityEvent('failed_2fa_attempt', {
  userId,
  ip: req.ip,
  attempts: 3
});
```

### 4. Include Context for Debugging

```js
// ✓ Good: enough context to debug
LoggingService.info('API call completed', {
  correlationId: req.correlationId,
  endpoint: '/api/v1/users',
  responseTime: 123,
  resultCount: 45
});

// ✗ Poor: no context
LoggingService.info('Done');
```

### 5. Don't Log Sensitive Data

```js
// ✗ Wrong: logs password
LoggingService.info('Login attempt', { email, password });

// ✓ Correct: logs only email
LoggingService.info('Login attempt', { email, ip });
```

## Monitoring and Alerts

### Log Aggregation Setup (Future Phases)

The structured JSON format supports integration with:
- **ELK Stack** (Elasticsearch, Logstash, Kibana)
- **Datadog** - Ship logs to Datadog
- **New Relic** - Infrastructure monitoring
- **Sentry** (Phase 14) - Error tracking

### Common Queries

```bash
# Find all failed login attempts
grep '"eventType":"login_failed"' logs/application-*.log

# Find slow requests (>1s)
grep '"warn"' logs/application-*.log | grep 'Slow request'

# Find errors for specific user
grep '"userId":"user-123"' logs/error-*.log

# Find requests by correlation ID
grep '"correlationId":"abc123"' logs/application-*.log
```

## Testing Logging

### Manual Testing

```bash
# Run application
npm run dev

# In another terminal, view logs
tail -f logs/application-*.log

# Trigger events (login, logout, errors)
```

### Log Level Testing

```bash
# Test debug logging
LOG_LEVEL=debug npm run dev

# Test error logging only
LOG_LEVEL=error npm run dev
```

## Performance Impact

- **Minimal** - Asynchronous logging to files
- **Console** output affects startup (disabled in production)
- **Disk I/O** - Buffered writes, only daily rotation I/O
- **Memory** - Winston buffers rotate daily, no memory leaks

## Troubleshooting

### Logs Directory Not Created

```bash
# Manually create logs directory
mkdir -p logs

# Ensure write permissions
chmod 755 logs
```

### Logs Not Appearing

```bash
# Check LOG_LEVEL environment variable
echo $LOG_LEVEL

# Verify logger is imported correctly
grep "require.*logger" src/**/*.js

# Check file permissions
ls -la logs/
```

### Logs Growing Too Large

- Max file size: 20MB (auto-rotates)
- Retention: 14 days (auto-deletes)
- Can be configured in `src/config/logger.js`

## Next Steps

**Phase 14** - Error Tracking with Sentry
- Centralized error reporting
- Performance monitoring
- Release tracking
- Custom integrations

**Phase 15** - Input Validation
- Request schema validation
- Error message formatting
- Structured error responses

**Phase 16** - Enhanced API Documentation
- OpenAPI improvements
- Request/response examples
- Error code documentation

## References

- [Winston Documentation](https://github.com/winstonjs/winston)
- [Winston-Daily-Rotate-File](https://github.com/winstonjs/winston-daily-rotate-file)
- [Structured Logging Best Practices](https://www.elastic.co/guide/en/elasticsearch/reference/current/indices-lifecycle-management.html)
- [Correlation IDs in Microservices](https://blog.rapid7.com/2016/12/23/the-value-of-correlation-ids/)
