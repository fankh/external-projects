# Phase 16: Enhanced API Documentation

## Overview

Phase 16 provides comprehensive API documentation including:
- **OpenAPI 3.0 Specification** - Machine-readable API contract
- **Request/Response Examples** - Real-world usage patterns
- **Error Codes** - Complete error documentation
- **Authentication Guide** - How to authenticate with the API
- **Rate Limiting** - Usage limits and throttling
- **Best Practices** - Security and efficiency guidelines

## API Base URLs

### Development
```
https://127.0.0.1:3005/api/v1
```

### Production
```
https://api.kyra.seekerslab.com/api/v1
```

## Authentication

### Session-Based (Web Browsers)

Most reliable for web applications:

```bash
# 1. Login
curl -X POST https://127.0.0.1:3005/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@seekerslab.com","password":"Password123"}' \
  -c cookies.txt

# 2. Use session cookie for API calls
curl -X GET https://127.0.0.1:3005/api/v1/users \
  -b cookies.txt
```

**Headers:**
```
Cookie: sessionId=abc123def456...
```

### Bearer Token (API Applications)

For programmatic access:

```bash
# Include JWT token in Authorization header
curl -X GET https://127.0.0.1:3005/api/v1/users \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Headers:**
```
Authorization: Bearer <jwt_token>
```

### CSRF Protection

For state-changing requests (POST, PUT, DELETE):

```bash
# 1. Get CSRF token from form
curl -X GET https://127.0.0.1:3005/login

# 2. Include token in POST request
curl -X POST https://127.0.0.1:3005/login \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: abc123token..." \
  -d '{"email":"user@example.com","password":"Pass123"}'
```

**Headers:**
```
X-CSRF-Token: <token>
X-Requested-With: XMLHttpRequest
```

## HTTP Status Codes

| Code | Meaning | Cause |
|------|---------|-------|
| 200 | OK | Request successful |
| 201 | Created | Resource created |
| 204 | No Content | Successful deletion |
| 400 | Bad Request | Invalid request (see details) |
| 401 | Unauthorized | Authentication required or failed |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Resource already exists |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Error | Server error |
| 503 | Service Unavailable | Maintenance/overload |

## Error Responses

### Validation Error (400)

```json
{
  "success": false,
  "error": "Validation failed",
  "details": {
    "email": "email must be a valid email address",
    "password": "password must be at least 8 characters long"
  }
}
```

### Authentication Error (401)

```json
{
  "success": false,
  "error": "Unauthorized - Invalid credentials"
}
```

### Authorization Error (403)

```json
{
  "success": false,
  "error": "Forbidden - Admin access required"
}
```

### Not Found Error (404)

```json
{
  "success": false,
  "error": "Not Found",
  "path": "/api/v1/users/invalid-id",
  "method": "GET"
}
```

### Rate Limit Error (429)

```json
{
  "success": false,
  "error": "Too many requests. Please try again later."
}
```

**Headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 3600
```

### Server Error (500)

```json
{
  "success": false,
  "error": "Internal Server Error"
}
```

## Rate Limiting

### Limits by Endpoint

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/login` | 5 requests | 15 minutes |
| `/api/v1/*` | 100 requests | 1 hour |
| `/api/v1/search` | 10 requests | 1 minute |

### Rate Limit Headers

All responses include:

```
X-RateLimit-Limit: 100        # Maximum requests
X-RateLimit-Remaining: 45     # Remaining requests
X-RateLimit-Reset: 1652345600 # Reset time (Unix timestamp)
```

### Handling Rate Limits

```javascript
const response = await fetch('/api/v1/users');

if (response.status === 429) {
  const resetTime = response.headers.get('X-RateLimit-Reset');
  const waitSeconds = resetTime - Math.floor(Date.now() / 1000);
  console.log(`Rate limited. Retry after ${waitSeconds} seconds`);
}
```

## Endpoints

### Health Check

**GET /health**

Health check endpoint - no authentication required.

```bash
curl -X GET https://127.0.0.1:3005/health
```

**Response (200):**
```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "2026-05-29T15:30:45.123Z"
}
```

### Authentication

#### Login

**POST /login**

Authenticate with email and password.

```bash
curl -X POST https://127.0.0.1:3005/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@seekerslab.com",
    "password": "Password123"
  }' \
  -c cookies.txt
```

**Request Body:**
```json
{
  "email": "string (required)",
  "password": "string (required, min 6)"
}
```

**Response (200) - No 2FA:**
```json
{
  "success": true,
  "message": "Login successful",
  "redirect": "/admin/dashboard"
}
```

**Response (302) - With 2FA enabled:**
Redirects to `/auth/2fa/verify`

**Errors:**
- `400` - Missing email or password
- `401` - Invalid credentials
- `403` - Account inactive
- `429` - Too many login attempts

#### Logout

**POST /logout**

Terminate current session.

```bash
curl -X POST https://127.0.0.1:3005/logout \
  -b cookies.txt
```

**Response (302):**
Redirects to login page with session cleared.

#### 2FA Verify

**GET /auth/2fa/verify**

Get 2FA verification form.

```bash
curl -X GET https://127.0.0.1:3005/auth/2fa/verify \
  -b cookies.txt
```

**POST /auth/2fa/verify**

Verify TOTP or backup code.

```bash
curl -X POST https://127.0.0.1:3005/auth/2fa/verify \
  -H "Content-Type: application/json" \
  -d '{"token": "123456"}' \
  -b cookies.txt
```

**Request Body:**
```json
{
  "token": "string (required, 6 digits or backup code)"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "2FA verification successful",
  "redirect": "/admin/dashboard"
}
```

**Response (302):**
Redirects to dashboard on success.

**Errors:**
- `401` - Invalid or expired code
- `401` - Backup code already used
- `302` - Not in 2FA pending state

#### 2FA Setup

**GET /auth/2fa/setup**

Get 2FA setup form with QR code (requires authentication).

```bash
curl -X GET https://127.0.0.1:3005/auth/2fa/setup \
  -b cookies.txt
```

**Response:**
HTML form with QR code and secret.

**POST /auth/2fa/setup**

Confirm 2FA setup with verification code.

```bash
curl -X POST https://127.0.0.1:3005/auth/2fa/setup \
  -H "Content-Type: application/json" \
  -d '{
    "token": "123456",
    "secret": "JFDE4TLQLUXEYURQGNTGK4D5ERACKUSREM2UOQTBKRGTS3Z7LZIA"
  }' \
  -b cookies.txt
```

**Response (200):**
```json
{
  "success": true,
  "backupCodes": ["a3f9c812", "b4g8d923", "c5h7e034"],
  "message": "2FA enabled. Save backup codes in a secure location."
}
```

**Response (302):**
Redirects to settings with backup codes.

**Errors:**
- `400` - Invalid verification code format
- `401` - Incorrect verification code
- `401` - Not authenticated

### Users

#### List Users

**GET /api/v1/users**

Get paginated list of users (requires authentication).

```bash
curl -X GET 'https://127.0.0.1:3005/api/v1/users?page=1&limit=10&sort=createdAt&order=desc' \
  -b cookies.txt \
  -H "Content-Type: application/json"
```

**Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 10, max: 100)
- `sort` - Sort field (default: createdAt)
- `order` - Sort order: `asc` or `desc` (default: desc)

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "admin@seekerslab.com",
      "name": "John Admin",
      "role": "admin",
      "status": "active",
      "totpEnabled": true,
      "createdAt": "2026-01-15T10:30:00Z",
      "updatedAt": "2026-05-29T15:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "pages": 3
  }
}
```

**Errors:**
- `401` - Not authenticated
- `403` - Insufficient permissions
- `400` - Invalid pagination parameters

#### Get User

**GET /api/v1/users/{userId}**

Get detailed user information.

```bash
curl -X GET 'https://127.0.0.1:3005/api/v1/users/550e8400-e29b-41d4-a716-446655440000' \
  -b cookies.txt
```

**Response (200):**
```json
{
  "success": true,
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "admin@seekerslab.com",
    "name": "John Admin",
    "role": "admin",
    "status": "active",
    "tenantId": "550e8400-e29b-41d4-a716-446655440001",
    "totpEnabled": true,
    "lastLogin": "2026-05-29T15:30:00Z",
    "createdAt": "2026-01-15T10:30:00Z",
    "updatedAt": "2026-05-29T15:30:00Z"
  }
}
```

**Errors:**
- `401` - Not authenticated
- `404` - User not found

#### Create User

**POST /api/v1/users**

Create new user (requires admin role).

```bash
curl -X POST https://127.0.0.1:3005/api/v1/users \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@seekerslab.com",
    "name": "Jane Editor",
    "password": "SecurePass123",
    "role": "editor"
  }' \
  -b cookies.txt
```

**Request Body:**
```json
{
  "email": "string (required, valid email)",
  "name": "string (optional, max 100)",
  "password": "string (required, min 8, must include upper/lower/digit)",
  "role": "string (required, one of: admin, editor, viewer)"
}
```

**Response (201):**
```json
{
  "success": true,
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440002",
    "email": "newuser@seekerslab.com",
    "name": "Jane Editor",
    "role": "editor",
    "status": "active",
    "createdAt": "2026-05-29T15:30:00Z"
  }
}
```

**Errors:**
- `400` - Invalid email or weak password
- `401` - Not authenticated
- `403` - Admin role required
- `409` - Email already exists

#### Update User

**PUT /api/v1/users/{userId}**

Update user information (admin or self).

```bash
curl -X PUT 'https://127.0.0.1:3005/api/v1/users/550e8400-e29b-41d4-a716-446655440000' \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Updated",
    "role": "editor"
  }' \
  -b cookies.txt
```

**Request Body:**
```json
{
  "email": "string (optional)",
  "name": "string (optional, max 100)",
  "role": "string (optional, one of: admin, editor, viewer)",
  "status": "string (optional, one of: active, inactive, suspended)"
}
```

**Response (200):**
```json
{
  "success": true,
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "admin@seekerslab.com",
    "name": "John Updated",
    "role": "editor",
    "status": "active",
    "updatedAt": "2026-05-29T15:30:00Z"
  }
}
```

**Errors:**
- `400` - Invalid data
- `401` - Not authenticated
- `403` - Cannot modify others (non-admin)
- `404` - User not found

### Audit Logs

#### Get Audit Logs

**GET /api/v1/audit-logs**

Get audit logs with filtering (requires authentication).

```bash
curl -X GET 'https://127.0.0.1:3005/api/v1/audit-logs?page=1&action=login_successful&userId=550e8400-e29b-41d4-a716-446655440000' \
  -b cookies.txt
```

**Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 10)
- `action` - Filter by action type (e.g., login_successful, user_created)
- `userId` - Filter by user ID

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440003",
      "userId": "550e8400-e29b-41d4-a716-446655440000",
      "action": "login_successful",
      "resource": "auth",
      "details": {
        "email": "admin@seekerslab.com",
        "ip": "192.168.1.100"
      },
      "ip": "192.168.1.100",
      "timestamp": "2026-05-29T15:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 150,
    "pages": 15
  }
}
```

**Errors:**
- `401` - Not authenticated
- `403` - Insufficient permissions

## Request/Response Examples

### JavaScript (Fetch API)

```javascript
// Login
const loginResponse = await fetch('https://127.0.0.1:3005/login', {
  method: 'POST',
  credentials: 'include',  // Include cookies
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'admin@seekerslab.com',
    password: 'Password123'
  })
});

// Get users
const usersResponse = await fetch(
  'https://127.0.0.1:3005/api/v1/users?page=1&limit=10',
  {
    method: 'GET',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' }
  }
);

const { data, pagination } = await usersResponse.json();
```

### Python (Requests)

```python
import requests

session = requests.Session()

# Login
login_resp = session.post(
    'https://127.0.0.1:3005/login',
    json={'email': 'admin@seekerslab.com', 'password': 'Password123'},
    verify=False  # For self-signed certificates
)

# Get users
users_resp = session.get(
    'https://127.0.0.1:3005/api/v1/users?page=1&limit=10',
    headers={'Content-Type': 'application/json'}
)

users_data = users_resp.json()
```

### cURL

```bash
# Login and save session
curl -X POST https://127.0.0.1:3005/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@seekerslab.com","password":"Password123"}' \
  -c cookies.txt \
  -k  # Ignore self-signed cert

# Get users
curl -X GET 'https://127.0.0.1:3005/api/v1/users?page=1&limit=10' \
  -b cookies.txt \
  -k
```

## OpenAPI Specification

The OpenAPI 3.0 specification is available at:

```
GET https://127.0.0.1:3005/api/openapi.json
```

### Swagger UI

Interactive API documentation:

```
https://127.0.0.1:3005/api/docs
```

### Generate Client Code

Using OpenAPI spec with code generators:

```bash
# Generate JavaScript client
openapi-generator-cli generate \
  -i https://127.0.0.1:3005/api/openapi.json \
  -g javascript \
  -o ./api-client

# Generate Python client
openapi-generator-cli generate \
  -i https://127.0.0.1:3005/api/openapi.json \
  -g python \
  -o ./api-client
```

## Security Best Practices

### 1. Always Use HTTPS

```javascript
// ✓ Correct
const response = await fetch('https://api.example.com/users');

// ✗ Wrong - uses plain HTTP
const response = await fetch('http://api.example.com/users');
```

### 2. Don't Log Sensitive Data

```javascript
// ✓ Correct - logs only safe data
console.log(`Logged in user: ${email}`);

// ✗ Wrong - logs password
console.log(`Login: ${email}:${password}`);
```

### 3. Store Tokens Securely

```javascript
// ✓ Correct - HTTP-only cookie (server manages)
// No JavaScript access to session cookie

// ✓ Acceptable - localStorage for JWT
localStorage.setItem('token', jwtToken);

// ✗ Wrong - store sensitive tokens in globals
window.authToken = token;  // Accessible to XSS
```

### 4. Validate Server Certificates

```javascript
// ✓ Production - verify certificates
const response = await fetch('https://api.example.com/users');

// ✓ Development - accept self-signed
const response = await fetch('https://localhost:3005/api/users', {
  agent: new https.Agent({ rejectUnauthorized: false })
});
```

### 5. Use CSRF Tokens

```javascript
// Get CSRF token from form or response header
const token = document.querySelector('input[name="_csrf"]').value;

// Include in POST/PUT/DELETE requests
const response = await fetch('https://api.example.com/users', {
  method: 'POST',
  headers: {
    'X-CSRF-Token': token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(userData)
});
```

## Troubleshooting

### 401 Unauthorized

**Problem:** Login required but no session

```bash
# Check if you're logged in
curl -b cookies.txt https://127.0.0.1:3005/api/v1/users -v

# Login first
curl -X POST https://127.0.0.1:3005/login \
  -d '{"email":"admin@seekerslab.com","password":"Password123"}' \
  -c cookies.txt
```

### 403 Forbidden

**Problem:** Insufficient permissions

```
{
  "success": false,
  "error": "Forbidden - Admin access required"
}
```

**Solution:** Use an admin account or request admin access

### 429 Too Many Requests

**Problem:** Rate limit exceeded

```
{
  "success": false,
  "error": "Too many requests. Please try again later."
}
```

**Solution:** Wait for X-RateLimit-Reset time before retrying

### 400 Bad Request

**Problem:** Invalid data

```json
{
  "success": false,
  "error": "Validation failed",
  "details": {
    "email": "email must be a valid email address"
  }
}
```

**Solution:** Check request body against schema and examples

## Changelog

### v1.0.0 (2026-05-29)

- Initial API release
- User management endpoints
- Authentication with 2FA
- Audit logging
- Rate limiting
- CSRF protection

## Support

For API support:
- **Documentation:** https://docs.kyra.seekerslab.com
- **Issues:** https://github.com/seekerslab/kyra/issues
- **Email:** api-support@seekerslab.com
