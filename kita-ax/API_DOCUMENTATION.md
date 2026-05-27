# KYRA Admin Console - API Documentation

## Overview

The KYRA Admin Console provides REST API endpoints for managing users, documents, access policies, audit logs, agents, and models. All API endpoints require authentication.

## Base URL

```
https://127.0.0.1:3005/api
```

## Authentication

All API requests require an authenticated session. Include your session cookie with each request:

```
Cookie: sessionId=<session-id>
```

## Response Format

All API responses follow a standard format:

```json
{
  "success": true,
  "data": { /* response data */ },
  "error": null
}
```

Error responses:

```json
{
  "success": false,
  "error": "Error message"
}
```

## Pagination

Endpoints that return lists support pagination with the following parameters:

- `page` (number, default: 1) - Page number
- `pageSize` (number, default: 10, max: 100) - Items per page

Response includes pagination metadata:

```json
{
  "success": true,
  "data": [ /* items */ ],
  "pagination": {
    "page": 1,
    "pageSize": 10,
    "total": 45,
    "totalPages": 5,
    "hasNext": true,
    "hasPrev": false
  }
}
```

## Filtering, Searching & Sorting

List endpoints support:

- `filters` - Filter by specific fields (e.g., `?status=active&role=admin`)
- `search` - Full-text search across configured fields (e.g., `?search=alice`)
- `sortBy` - Sort by field name (e.g., `?sortBy=email`)
- `sortOrder` - Sort direction: `asc` or `desc` (default: `asc`)

## Endpoints

### Users

#### List Users

```
GET /api/users
```

**Query Parameters:**
- `page` (number)
- `pageSize` (number)
- `search` (string) - Search by email or role
- `status` (string) - Filter by status: `active`, `inactive`
- `role` (string) - Filter by role: `admin`, `editor`, `viewer`
- `sortBy` (string)
- `sortOrder` (string)

**Example:**

```bash
GET /api/users?page=1&pageSize=10&status=active&sortBy=email
```

#### Get User

```
GET /api/users/:id
```

#### Create User

```
POST /api/users
Content-Type: application/json

{
  "email": "user@example.com",
  "role": "editor"
}
```

#### Update User

```
PUT /api/users/:id
Content-Type: application/json

{
  "email": "newemail@example.com",
  "role": "viewer",
  "status": "inactive"
}
```

#### Delete User

```
DELETE /api/users/:id
```

### Documents

#### List Documents

```
GET /api/documents
```

**Query Parameters:**
- `page` (number)
- `pageSize` (number)
- `search` (string) - Search by title or owner
- `classification` (string) - Filter: `public`, `internal`, `confidential`, `secret`
- `sortBy` (string)
- `sortOrder` (string)

#### Get Document

```
GET /api/documents/:id
```

#### Create Document

```
POST /api/documents
Content-Type: application/json

{
  "title": "Document Title",
  "classification": "confidential",
  "owner": "admin@example.com"
}
```

#### Update Document

```
PUT /api/documents/:id
Content-Type: application/json

{
  "title": "New Title",
  "classification": "secret",
  "owner": "newowner@example.com"
}
```

#### Delete Document

```
DELETE /api/documents/:id
```

### Roles (RBAC)

#### List Roles

```
GET /api/roles
```

#### Get Role

```
GET /api/roles/:name
```

#### Create Role

```
POST /api/roles
Content-Type: application/json

{
  "name": "analyst",
  "description": "Data analyst role",
  "permissions": ["read:documents", "read:reports"]
}
```

### ABAC Rules

#### List ABAC Rules

```
GET /api/abac-rules
```

**Query Parameters:**
- `status` (string) - Filter: `active`, `inactive`
- `sortBy` (string)
- `sortOrder` (string)

#### Get ABAC Rule

```
GET /api/abac-rules/:name
```

#### Create ABAC Rule

```
POST /api/abac-rules
Content-Type: application/json

{
  "name": "Executive Documents",
  "condition": "department == 'executive' AND clearance >= 3",
  "effect": "allow",
  "resources": ["doc-001", "doc-002"]
}
```

### Policies

#### List Policies

```
GET /api/policies
```

**Query Parameters:**
- `status` (string) - Filter: `active`, `inactive`
- `type` (string) - Filter: `rbac`, `abac`
- `sortBy` (string)
- `sortOrder` (string)

#### Get Policy

```
GET /api/policies/:name
```

#### Create Policy

```
POST /api/policies
Content-Type: application/json

{
  "name": "Default User Policy",
  "type": "rbac",
  "target": "all_users"
}
```

### Audit Logs

#### List Audit Logs

```
GET /api/audit-logs
```

**Query Parameters:**
- `page` (number)
- `pageSize` (number)
- `search` (string) - Search by user, action, resource
- `eventType` (string) - Filter: `authentication`, `document-access`, `policy-change`, `user-management`
- `status` (string) - Filter: `success`, `failure`
- `sortBy` (string)
- `sortOrder` (string)

### Agents

#### List Agents

```
GET /api/agents
```

**Query Parameters:**
- `status` (string) - Filter: `active`, `inactive`
- `sortBy` (string)
- `sortOrder` (string)

#### Get Agent

```
GET /api/agents/:id
```

#### Create Agent

```
POST /api/agents
Content-Type: application/json

{
  "name": "New Agent",
  "type": "analysis"
}
```

#### List Agent Groups

```
GET /api/agent-groups
```

### Models

#### List Models

```
GET /api/models
```

**Query Parameters:**
- `status` (string) - Filter: `active`, `inactive`
- `sortBy` (string)
- `sortOrder` (string)

### Dashboard

#### Get Dashboard Metrics

```
GET /api/dashboard/metrics
```

**Response:**

```json
{
  "success": true,
  "data": {
    "totalDocuments": 4,
    "activeUsers": 3,
    "totalPolicies": 3,
    "auditEvents": 6
  }
}
```

#### Get Recent Events

```
GET /api/dashboard/recent-events
```

## Error Responses

### 401 Unauthorized

```json
{
  "success": false,
  "error": "Unauthorized"
}
```

### 403 Forbidden

```json
{
  "success": false,
  "error": "Insufficient permissions"
}
```

### 404 Not Found

```json
{
  "success": false,
  "error": "Resource not found"
}
```

### 400 Bad Request

```json
{
  "success": false,
  "error": "Invalid request parameters"
}
```

## Rate Limiting

API requests are rate-limited to:
- **General:** 100 requests per 15 minutes per IP
- **Login:** 5 failed attempts per 15 minutes per IP

Rate limit headers are included in responses:
- `RateLimit-Limit` - Rate limit
- `RateLimit-Remaining` - Requests remaining
- `RateLimit-Reset` - Unix timestamp when limit resets

## Examples

### Get Active Users

```bash
curl -X GET "https://127.0.0.1:3005/api/users?status=active&sortBy=email" \
  -H "Cookie: sessionId=<session-id>"
```

### Search Documents

```bash
curl -X GET "https://127.0.0.1:3005/api/documents?search=security&classification=confidential" \
  -H "Cookie: sessionId=<session-id>"
```

### Create New User

```bash
curl -X POST "https://127.0.0.1:3005/api/users" \
  -H "Cookie: sessionId=<session-id>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@example.com",
    "role": "editor"
  }'
```

### Get Audit Logs with Filter

```bash
curl -X GET "https://127.0.0.1:3005/api/audit-logs?eventType=authentication&status=failure&page=1&pageSize=20" \
  -H "Cookie: sessionId=<session-id>"
```

## Testing

Run the test suite:

```bash
npm test
```

Run tests for pagination utilities:

```bash
npm test -- --testPathPattern="pagination"
```

Run tests for API routes:

```bash
npm test -- --testPathPattern="api"
```

## Implementation Notes

- All timestamps are in ISO 8601 format
- All IDs are alphanumeric strings
- Mock data is used in development; replace with database queries in production
- Pagination defaults to 10 items per page, max 100
- Search is case-insensitive
- Empty filter parameters are ignored
