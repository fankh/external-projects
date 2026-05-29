/**
 * Authentication Routes for KYRA Admin Console
 */

const express = require('express');
const router = express.Router();
const passport = require('passport');
const { loginLimiter } = require('../middleware/security');
const { googleAuth, githubAuth, googleCallback, githubCallback, oauthCallback } = require('../middleware/oauth');
const UserService = require('../services/userService');
const AuditLogService = require('../services/auditLogService');

// Default tenant ID for single-tenant deployments
const TENANT_ID = process.env.DEFAULT_TENANT_ID || '550e8400-e29b-41d4-a716-446655440000';

// GET /login - Show login page
router.get('/login', (req, res) => {
  const error = req.query.error;
  res.render('login', {
    title: 'Login - KYRA Admin Console',
    csrfToken: req.csrfToken?.() || '',
    error: error ? decodeURIComponent(error) : null,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID
  });
});

// POST /login - Process login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    // Verify password against database
    const isValidPassword = await UserService.verifyPassword(email, password, TENANT_ID);

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    // Get user details
    let user;
    try {
      user = await UserService.getUserByEmail(email, TENANT_ID);
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }

    // Check if user is active
    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        error: 'User account is inactive'
      });
    }

    // Update last login timestamp
    try {
      await UserService.updateLastLogin(email, TENANT_ID);
    } catch (err) {
      console.warn('Failed to update last login:', err.message);
      // Don't fail login if this fails
    }

    // Set session
    req.session.userId = user.id;
    req.session.email = user.email;
    req.session.role = user.role;
    req.session.tenantId = user.tenantId;
    req.session.name = user.name || email;

    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).json({
          success: false,
          error: 'Session creation failed'
        });
      }

      // Check if JSON response expected
      if (req.headers['content-type']?.includes('application/json')) {
        res.json({
          success: true,
          message: 'Login successful',
          redirect: '/admin/dashboard'
        });
      } else {
        // Redirect for form submission
        const redirect = req.query.redirect || '/admin/dashboard';
        res.redirect(redirect);
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed - please try again'
    });
  }
});

// POST /logout - Process logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({
        success: false,
        error: 'Logout failed'
      });
    }

    res.clearCookie('sessionId');

    if (req.headers['content-type']?.includes('application/json')) {
      res.json({
        success: true,
        message: 'Logged out successfully'
      });
    } else {
      res.redirect('/login');
    }
  });
});

// GET /health - Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    authenticated: !!req.session?.userId
  });
});

// ===== OAUTH ROUTES =====

// Google OAuth
router.get('/google', googleAuth);

router.get('/google/callback', googleCallback, oauthCallback);

// GitHub OAuth
router.get('/github', githubAuth);

router.get('/github/callback', githubCallback, oauthCallback);

// Connect/link OAuth provider to existing account
router.post('/link/:provider', async (req, res) => {
  if (!req.user) {
    return res.redirect('/login');
  }

  try {
    // Redirect to OAuth provider
    if (req.params.provider === 'google') {
      return res.redirect(`/auth/google?state=/admin/settings`);
    } else if (req.params.provider === 'github') {
      return res.redirect(`/auth/github?state=/admin/settings`);
    }

    res.status(400).json({ error: 'Unknown provider' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Disconnect OAuth provider
router.post('/unlink/:provider', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const OAuthService = require('../services/oauthService');
    const success = await OAuthService.unlinkOAuthAccount(req.user.email, req.params.provider, TENANT_ID);

    if (success) {
      await AuditLogService.createLog({
        eventType: 'authentication',
        user: req.user.email,
        resource: req.params.provider,
        action: 'Unlink OAuth provider',
        status: 'success',
        ipAddress: req.ip,
        tenantId: TENANT_ID
      });

      return res.json({ success: true, message: `${req.params.provider} account disconnected` });
    }

    res.status(404).json({ error: 'Provider not linked' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
