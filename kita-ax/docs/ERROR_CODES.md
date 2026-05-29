# Error Code Reference

## Overview

This document lists all HTTP status codes, error types, and resolution steps used by the KYRA API.

## HTTP Status Codes

### 2xx Success

| Code | Meaning | Usage |
|------|---------|-------|
| 200 | OK | GET, PUT successful |
| 201 | Created | POST successful, resource created |
| 204 | No Content | DELETE successful |

### 4xx Client Errors

| Code | Meaning | Cause |
|------|---------|-------|
| 400 | Bad Request | Invalid request data or missing required fields |
| 401 | Unauthorized | Authentication required or credentials invalid |
| 403 | Forbidden | Authenticated but lacking permissions |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Resource already exists (duplicate) |
| 429 | Too Many Requests | Rate limit exceeded |

### 5xx Server Errors

| Code | Meaning | Cause |
|------|---------|-------|
| 500 | Internal Server Error | Unexpected server error |
| 503 | Service Unavailable | Maintenance or overloaded |

## Common Error Scenarios

### 400 Bad Request - Validation Error
```json
{
  "success": false,
  "error": "Validation failed",
  "details": {
    "email": "email must be a valid email address"
  }
}
```

### 401 Unauthorized - Invalid Credentials
```json
{
  "success": false,
  "error": "Unauthorized - Invalid credentials"
}
```

### 403 Forbidden - Insufficient Permissions
```json
{
  "success": false,
  "error": "Forbidden - Admin access required"
}
```

### 404 Not Found
```json
{
  "success": false,
  "error": "Not Found",
  "path": "/api/v1/users/invalid-id",
  "method": "GET"
}
```

### 429 Too Many Requests - Rate Limited
```json
{
  "success": false,
  "error": "Too many requests. Please try again later."
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "error": "Internal Server Error"
}
```

## Error Handling Best Practices

1. **Always check response status** - Don't assume success
2. **Parse error details** - Use details field for validation errors
3. **Implement retry logic** - For 5xx and 429 errors
4. **Log errors** - For debugging and monitoring
5. **Show user-friendly messages** - Don't expose internal details

## Retry Strategy

```javascript
async function retryWithBackoff(fn, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```
