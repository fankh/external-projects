/**
 * Integration Tests for Health Endpoint
 */

const request = require('supertest');
const app = require('../../../src/server');

describe('Health Endpoint', () => {
  describe('GET /health', () => {
    test('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toEqual({
        success: true,
        status: 'healthy',
        timestamp: expect.any(String),
      });
    });

    test('should return valid ISO timestamp', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      const timestamp = new Date(response.body.timestamp);
      expect(timestamp instanceof Date).toBe(true);
      expect(timestamp.toISOString()).toBeTruthy();
    });

    test('should be accessible without authentication', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/openapi.json', () => {
    test('should return OpenAPI specification', async () => {
      const response = await request(app)
        .get('/api/openapi.json')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('openapi');
      expect(response.body).toHaveProperty('info');
      expect(response.body).toHaveProperty('paths');
    });

    test('should be accessible without authentication', async () => {
      const response = await request(app)
        .get('/api/openapi.json')
        .expect(200);

      expect(response.body.info).toBeDefined();
    });
  });

  describe('GET /api/docs', () => {
    test('should serve Swagger UI', async () => {
      const response = await request(app)
        .get('/api/docs')
        .expect(200);

      expect(response.text).toContain('swagger');
    });
  });

  describe('Error Handling', () => {
    test('should return 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/unknown/route/that/does/not/exist')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: 'Not Found',
        path: '/unknown/route/that/does/not/exist',
        method: 'GET',
      });
    });

    test('should handle 404 with correct status', async () => {
      const response = await request(app)
        .post('/api/v1/nonexistent')
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });
});
