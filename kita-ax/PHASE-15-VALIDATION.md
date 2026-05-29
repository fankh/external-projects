# Phase 15: Input Validation & Data Schemas

## Overview

Phase 15 implements comprehensive input validation and data schema validation using Joi with:
- **Schema Validation** - Request body, query, and parameter validation
- **Error Formatting** - Structured validation error responses
- **Custom Validators** - Email, URL, UUID, phone, postal codes
- **Middleware Integration** - Validation at route handler level
- **Type Safety** - Enforce data types and constraints
- **Security** - Prevent invalid/malicious input

## Dependencies

```bash
npm install joi
```

- `joi` — Schema validation library with comprehensive rules

## Components

### 1. Validation Schemas (`src/schemas/validationSchemas.js`)

Reusable Joi schemas for common request types:

**Authentication:**
- `loginSchema` — Email, password validation
- `twoFactorVerifySchema` — 6-digit token validation
- `twoFactorSetupSchema` — Setup token and secret validation

**Users:**
- `userCreateSchema` — New user with password complexity
- `userUpdateSchema` — Partial user updates
- `passwordChangeSchema` — Password change validation

**Documents:**
- `documentCreateSchema` — Title, content, metadata
- `documentUpdateSchema` — Partial document updates

**Query:**
- `paginationSchema` — Page, limit, sort, order
- `searchSchema` — Query with pagination

**Settings:**
- `preferencesUpdateSchema` — Theme, language, notifications

**OAuth:**
- `oauthCallbackSchema` — OAuth code and state

### 2. Validation Middleware (`src/middleware/validation.js`)

Express middleware for automatic request validation:

```js
const { validateBody, validateQuery } = require('./middleware/validation');
const { loginSchema } = require('./schemas/validationSchemas');

router.post('/login', 
  validateBody(loginSchema),
  (req, res) => {
    // req.validatedData contains sanitized data
    const { email, password } = req.validatedData;
  }
);
```

#### Validation Functions

**validateBody(schema)** — Validate request body only
```js
router.post('/users', validateBody(userCreateSchema), handler);
```

**validateQuery(schema)** — Validate query parameters only
```js
router.get('/users', validateQuery(paginationSchema), handler);
```

**validateParams(schema)** — Validate path parameters only
```js
router.get('/users/:id', validateParams(userParamSchema), handler);
```

**validateAll(schema)** — Validate body, query, and params
```js
router.put('/users/:id', validateAll(userUpdateSchema), handler);
```

#### Validation Response

Success (400 on validation failure):
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

### 3. Custom Validators

Built-in custom validators for common patterns:

```js
const { validators } = require('./middleware/validation');

validators.email('user@example.com');      // true
validators.url('https://example.com');     // true
validators.uuid('a1b2c3d4-e5f6-7890...');  // true
validators.phone('+1-555-123-4567');       // true
validators.postalCode('12345');            // true
```

## Schema Rules

### String Validation

```js
const schema = Joi.object({
  username: Joi.string()
    .min(3)
    .max(30)
    .required()
    .messages(messages),
  
  email: Joi.string()
    .email()
    .required(),
  
  password: Joi.string()
    .min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)  // lowercase, uppercase, digit
    .required(),
  
  description: Joi.string()
    .max(500)
    .optional(),
});
```

### Number Validation

```js
const schema = Joi.object({
  age: Joi.number()
    .min(18)
    .max(120)
    .required(),
  
  price: Joi.number()
    .positive()
    .precision(2)
    .optional(),
});
```

### Array Validation

```js
const schema = Joi.object({
  tags: Joi.array()
    .items(Joi.string().max(50))
    .max(10)
    .optional(),
  
  items: Joi.array()
    .items(Joi.object({
      id: Joi.string().required(),
      quantity: Joi.number().min(1).required(),
    }))
    .required(),
});
```

### Conditional Validation

```js
const schema = Joi.object({
  accountType: Joi.string()
    .valid('personal', 'business')
    .required(),
  
  businessName: Joi.string()
    .when('accountType', {
      is: 'business',
      then: Joi.required(),
      otherwise: Joi.optional(),
    }),
});
```

### Cross-Field Validation

```js
const passwordChangeSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).required(),
  confirmPassword: Joi.string()
    .valid(Joi.ref('newPassword'))
    .required()
    .messages({
      'any.only': 'Password confirmation does not match',
    }),
});
```

## Error Messages

### Custom Error Messages

```js
const customMessages = {
  'string.email': '{#label} must be a valid email',
  'string.min': '{#label} must be at least {#limit} characters',
  'any.required': '{#label} is required',
};

const schema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages(customMessages),
});
```

### Field Labels

```js
const schema = Joi.object({
  user_email: Joi.string()
    .email()
    .required()
    .messages({
      'any.required': 'Email address is required',
    })
    .label('Email Address'),  // Better in errors
});

// Error: "Email Address is required" (not "user_email is required")
```

## Usage Examples

### Login Endpoint

```js
const { validateBody } = require('../middleware/validation');
const { loginSchema } = require('../schemas/validationSchemas');

router.post('/login', 
  validateBody(loginSchema),
  async (req, res) => {
    const { email, password } = req.validatedData;
    // Process login...
  }
);
```

### User List with Pagination

```js
const { validateQuery } = require('../middleware/validation');
const { paginationSchema } = require('../schemas/validationSchemas');

router.get('/users',
  validateQuery(paginationSchema),
  async (req, res) => {
    const { page, limit, sort } = req.validatedData;
    // Fetch paginated users...
  }
);
```

### Document Update

```js
const { validateBody } = require('../middleware/validation');
const { documentUpdateSchema } = require('../schemas/validationSchemas');

router.put('/documents/:id',
  validateBody(documentUpdateSchema),
  async (req, res) => {
    const { title, content, status } = req.validatedData;
    // Update document...
  }
);
```

## Validation Flow

1. **Request arrives** → Express middleware chain
2. **Validation middleware** → Validates against schema
3. **On error** → Returns 400 with detailed error object
4. **On success** → Calls `next()`, attaches `req.validatedData`
5. **Route handler** → Uses validated data (sanitized, type-safe)

## Integration with Error Tracking

Validation errors are automatically tracked:

```js
// Validation middleware logs and tracks errors
LoggingService.warn('Validation error', { errors, path, method });
ErrorTrackingService.captureValidationError(fieldName, message, { errors });
```

## Security Considerations

### Input Sanitization

```js
// Joi automatically:
// - Trims whitespace
// - Removes unknown fields (stripUnknown: true)
// - Casts types
// - Validates patterns

const { email } = Joi.object({
  email: Joi.string().email().required(),
}).validate({ email: '  user@example.com  ' });

// email = 'user@example.com' (trimmed)
```

### SQL Injection Prevention

Joi ensures type safety, preventing SQL injection:

```js
// Invalid input rejected at schema level
const { error } = userIdSchema.validate({ id: "'; DROP TABLE users; --" });
// error: "id must be a number"
```

### XSS Prevention

Validation enforces expected formats:

```js
// Script tags rejected by email validation
const { error } = Joi.string().email().validate('<script>alert("XSS")</script>');
// error: "must be a valid email address"
```

## Best Practices

1. **Always validate at schema boundaries** — Validate at API endpoints
2. **Use strong password rules** — Require complexity
3. **Validate file uploads** — Check mime type, size, extension
4. **Reject unknown fields** — Use `stripUnknown: true`
5. **Provide clear error messages** — Help users fix invalid input
6. **Log validation failures** — Track attack patterns
7. **Don't expose internal fields** — Validate API contract

## Testing Validation

### Unit Test Example

```js
const schema = require('../schemas/validationSchemas');

describe('loginSchema', () => {
  test('accepts valid email and password', () => {
    const { error } = schema.loginSchema.validate({
      email: 'user@example.com',
      password: 'SecurePass123',
    });
    expect(error).toBeUndefined();
  });

  test('rejects invalid email', () => {
    const { error } = schema.loginSchema.validate({
      email: 'invalid-email',
      password: 'SecurePass123',
    });
    expect(error).toBeDefined();
    expect(error.details[0].message).toContain('valid email');
  });

  test('rejects short password', () => {
    const { error } = schema.loginSchema.validate({
      email: 'user@example.com',
      password: 'short',
    });
    expect(error).toBeDefined();
  });
});
```

## Validation Performance

- **Fast** — Joi validation is synchronous and optimized
- **No database lookups** — Schema validation only
- **Caching** — Joi caches compiled schemas
- **Minimal overhead** — < 1ms per request

## Troubleshooting

### Validation Always Passes

```js
// ✗ Wrong - missing middleware
router.post('/login', handler);

// ✓ Correct
router.post('/login', validateBody(loginSchema), handler);
```

### Validated Data Not Available

```js
// ✓ Correct - validate first
router.post('/login', validateBody(loginSchema), (req, res) => {
  const { email } = req.validatedData;  // Available
});
```

### Custom Error Messages Not Showing

```js
// ✓ Correct - messages in schema
const schema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Invalid email format',
    'any.required': 'Email is required',
  }),
});
```

## Next Steps

**Phase 16** - Enhanced API Documentation
- OpenAPI improvements
- Request/response examples
- Error code documentation

**Phase 17** - CI/CD Pipeline
- Automated testing
- GitHub Actions workflows
- Release management

## References

- [Joi Documentation](https://joi.dev/)
- [Joi API Reference](https://joi.dev/api/)
- [Schema Validation Best Practices](https://joi.dev/getting-started/)
- [Joi Examples](https://joi.dev/tester)
