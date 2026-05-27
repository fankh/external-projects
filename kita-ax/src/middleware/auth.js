/**
 * Authentication Middleware for KYRA Admin Console
 */

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    // Check if this is an API request
    if (req.headers['content-type']?.includes('application/json') ||
        req.path.startsWith('/api/')) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized - please log in'
      });
    }

    // For page requests, redirect to login
    return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
  }

  // Attach user info to request
  req.user = {
    id: req.session.userId,
    email: req.session.email,
    role: req.session.role,
    tenantId: req.session.tenantId
  };

  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    if (req.headers['content-type']?.includes('application/json') ||
        req.path.startsWith('/api/')) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    return res.status(403).send('Admin access required');
  }

  next();
}

function optionalAuth(req, res, next) {
  if (req.session && req.session.userId) {
    req.user = {
      id: req.session.userId,
      email: req.session.email,
      role: req.session.role,
      tenantId: req.session.tenantId
    };
  }

  next();
}

module.exports = {
  requireAuth,
  requireAdmin,
  optionalAuth
};
