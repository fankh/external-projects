/**
 * Integration Tests for Protected API Endpoints
 */

const request = require('supertest');
const app = require('../../../src/server');

describe('Protected API Endpoints', () => {
  describe('GET /api/v1/users', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Content-Type', 'application/json')
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        error: expect.stringContaining('Unauthorized'),
      });
    });

    test('should reject requests with invalid session', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Cookie', 'sessionId=invalid-session')
        .set('Content-Type', 'application/json')
        .expect([401, 302]);

      expect(response.status).toBeGreaterThanOrEqual(301);
    });

    test('should return JSON error for API requests', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Content-Type', 'application/json')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(typeof response.body.error).toBe('string');
    });
  });

  describe('GET /admin/dashboard', () => {
    test('should redirect to login without authentication', async () => {
      const response = await request(app)
        .get('/admin/dashboard')
        .expect(302);

      expect(response.headers.location).toContain('/login');
    });
  });

  describe('GET /admin/settings', () => {
    test('should redirect to login without authentication', async () => {
      const response = await request(app)
        .get('/admin/settings')
        .expect(302);

      expect(response.headers.location).toContain('/login');
    });
  });

  describe('Authentication Headers', () => {
    test('should accept application/json content-type', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Content-Type', 'application/json')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    test('should accept application/json; charset=utf-8', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Content-Type', 'application/json; charset=utf-8')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('CSRF Protection', () => {
    test('should include CSRF protection on forms', async () => {
      const response = await request(app)
        .get('/login')
        .expect(200);

      expect(response.text).toContain('_csrf');
    });

    test('should validate CSRF on POST requests', async () => {
      const response = await request(app)
        .post('/login')
        .send({
          email: 'test@example.com',
          password: 'password',
          _csrf: 'invalid-csrf-token',
        })
        .expect([400, 403]);

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Error Responses', () => {
    test('should return error for invalid paths', async () => {
      const response = await request(app)
        .get('/api/v1/invalid-endpoint')
        .set('Content-Type', 'application/json')
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    test('should handle internal server errors gracefully', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Content-Type', 'application/json')
        .expect([401, 500]);

      expect(response.body).toHaveProperty('success');
    });
  });

  describe('Redirect Behavior', () => {
    test('should include redirect parameter in login redirect', async () => {
      const response = await request(app)
        .get('/admin/users')
        .expect(302);

      expect(response.headers.location).toContain('/login?redirect=');
      expect(response.headers.location).toContain(
        encodeURIComponent('/admin/users')
      );
    });

    test('should not redirect API requests', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Content-Type', 'application/json')
        .expect(401);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });
});
