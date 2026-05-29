/**
 * Unit Tests for Authentication Middleware
 */

const {
  requireAuth,
  requireAdmin,
  optionalAuth,
  requireTwoFactor,
} = require('../../../src/middleware/auth');

describe('Authentication Middleware', () => {
  describe('requireAuth', () => {
    test('should block requests without session', () => {
      const req = {
        session: null,
        headers: { 'content-type': 'application/json' },
        path: '/api/users',
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        redirect: jest.fn(),
      };
      const next = jest.fn();

      requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('Unauthorized'),
        })
      );
    });

    test('should block requests without userId in session', () => {
      const req = {
        session: {},
        headers: { 'content-type': 'application/json' },
        path: '/api/users',
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    test('should allow authenticated requests', () => {
      const req = {
        session: {
          userId: 'user-123',
          email: 'test@example.com',
          role: 'admin',
          tenantId: 'tenant-123',
        },
        headers: {},
        path: '/admin/dashboard',
      };
      const res = {};
      const next = jest.fn();

      requireAuth(req, res, next);

      expect(req.user).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        role: 'admin',
        tenantId: 'tenant-123',
      });
      expect(next).toHaveBeenCalled();
    });

    test('should redirect to login for page requests without auth', () => {
      const req = {
        session: null,
        headers: {},
        path: '/admin/dashboard',
        originalUrl: '/admin/dashboard?page=1',
      };
      const res = {
        redirect: jest.fn(),
      };
      const next = jest.fn();

      requireAuth(req, res, next);

      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('/login?redirect=')
      );
    });

    test('should detect API requests by content-type', () => {
      const req = {
        session: null,
        headers: { 'content-type': 'application/json; charset=utf-8' },
        path: '/admin/settings',
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalled();
    });

    test('should detect API requests by path', () => {
      const req = {
        session: null,
        headers: {},
        path: '/api/v1/users',
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalled();
    });
  });

  describe('requireAdmin', () => {
    test('should block non-admin users', () => {
      const req = {
        user: {
          id: 'user-123',
          role: 'viewer',
        },
        headers: { 'content-type': 'application/json' },
        path: '/api/users',
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        send: jest.fn(),
      };
      const next = jest.fn();

      requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('Admin'),
        })
      );
    });

    test('should allow admin users', () => {
      const req = {
        user: {
          id: 'user-123',
          role: 'admin',
        },
        headers: {},
        path: '/admin/users',
      };
      const res = {};
      const next = jest.fn();

      requireAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('should block requests without user object', () => {
      const req = {
        user: null,
        headers: { 'content-type': 'application/json' },
        path: '/api/users',
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    test('should send HTML response for non-API requests', () => {
      const req = {
        user: { role: 'viewer' },
        headers: {},
        path: '/admin/dashboard',
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };
      const next = jest.fn();

      requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.send).toHaveBeenCalled();
    });
  });

  describe('optionalAuth', () => {
    test('should attach user if authenticated', () => {
      const req = {
        session: {
          userId: 'user-123',
          email: 'test@example.com',
          role: 'admin',
          tenantId: 'tenant-123',
        },
        user: undefined,
      };
      const res = {};
      const next = jest.fn();

      optionalAuth(req, res, next);

      expect(req.user).toBeDefined();
      expect(req.user.id).toBe('user-123');
      expect(next).toHaveBeenCalled();
    });

    test('should continue if not authenticated', () => {
      const req = {
        session: null,
        user: undefined,
      };
      const res = {};
      const next = jest.fn();

      optionalAuth(req, res, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    test('should always call next', () => {
      const req = { session: {} };
      const res = {};
      const next = jest.fn();

      optionalAuth(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('requireTwoFactor', () => {
    test('should block requests with pending 2FA', () => {
      const req = {
        session: {
          pendingTwoFactor: true,
        },
        headers: { 'content-type': 'application/json' },
        path: '/api/users',
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        redirect: jest.fn(),
      };
      const next = jest.fn();

      requireTwoFactor(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('2FA'),
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    test('should redirect to 2FA verify for page requests', () => {
      const req = {
        session: {
          pendingTwoFactor: true,
        },
        headers: {},
        path: '/admin/dashboard',
      };
      const res = {
        redirect: jest.fn(),
      };
      const next = jest.fn();

      requireTwoFactor(req, res, next);

      expect(res.redirect).toHaveBeenCalledWith('/auth/2fa/verify');
    });

    test('should allow requests without pending 2FA', () => {
      const req = {
        session: {
          pendingTwoFactor: false,
        },
      };
      const res = {};
      const next = jest.fn();

      requireTwoFactor(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('should allow requests without session', () => {
      const req = {
        session: null,
      };
      const res = {};
      const next = jest.fn();

      requireTwoFactor(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });
});
