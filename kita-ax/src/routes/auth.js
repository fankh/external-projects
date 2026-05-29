/**
 * Authentication Routes for KYRA Admin Console
 */

const express = require('express');
const router = express.Router();
const passport = require('passport');
const { loginLimiter } = require('../middleware/security');
const { googleAuth, githubAuth, googleCallback, githubCallback, oauthCallback } = require('../middleware/oauth');
const { requireAuth } = require('../middleware/auth');
const UserService = require('../services/userService');
const TwoFactorService = require('../services/twoFactorService');
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
    }

    // Check if 2FA is enabled
    if (user.totpEnabled) {
      // Set partial session (pending 2FA verification)
      req.session.pendingTwoFactor = true;
      req.session.pendingUserId = user.id;
      req.session.pendingEmail = user.email;
      req.session.pendingRole = user.role;
      req.session.pendingTenantId = user.tenantId;
      req.session.pendingName = user.name || email;

      return req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          return res.status(500).json({
            success: false,
            error: 'Session creation failed'
          });
        }

        if (req.headers['content-type']?.includes('application/json')) {
          res.json({
            success: true,
            message: '2FA verification required',
            redirect: '/auth/2fa/verify'
          });
        } else {
          res.redirect('/auth/2fa/verify');
        }
      });
    }

    // 2FA not enabled - set full session
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

// ===== 2FA ROUTES =====

// GET /2fa/verify - Show 2FA verification page
router.get('/2fa/verify', (req, res) => {
  if (!req.session?.pendingTwoFactor) {
    return res.redirect('/login');
  }

  res.render('2fa-verify', {
    title: '2FA Verification - KYRA',
    csrfToken: req.csrfToken?.() || '',
    error: req.query.error ? decodeURIComponent(req.query.error) : null
  });
});

// POST /2fa/verify - Verify TOTP or backup code
router.post('/2fa/verify', async (req, res) => {
  try {
    if (!req.session?.pendingTwoFactor) {
      return res.status(400).json({ success: false, error: 'Not in 2FA pending state' });
    }

    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, error: 'Code is required' });
    }

    // Get pending user
    const user = await UserService.getUserById(req.session.pendingUserId, TENANT_ID);

    if (!user) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }

    let isValid = false;
    let isBackupCode = false;

    // Try TOTP verification first
    if (TwoFactorService.verifyToken(user.totpSecret, token)) {
      isValid = true;
    } else if (await TwoFactorService.verifyBackupCode(user, token)) {
      isValid = true;
      isBackupCode = true;
    }

    if (!isValid) {
      await AuditLogService.createLog({
        userId: user.id,
        action: '2FA_FAILED',
        resourceType: 'Authentication',
        status: 'failure',
        details: { ip: req.ip },
        tenantId: TENANT_ID
      });

      return res.status(401).json({
        success: false,
        error: 'Invalid verification code'
      });
    }

    // Clear pending state and set full session
    req.session.pendingTwoFactor = false;
    req.session.userId = req.session.pendingUserId;
    req.session.email = req.session.pendingEmail;
    req.session.role = req.session.pendingRole;
    req.session.tenantId = req.session.pendingTenantId;
    req.session.name = req.session.pendingName;

    // Audit log
    await AuditLogService.createLog({
      userId: user.id,
      action: isBackupCode ? '2FA_BACKUP_USED' : '2FA_VERIFIED',
      resourceType: 'Authentication',
      status: 'success',
      details: { ip: req.ip },
      tenantId: TENANT_ID
    });

    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).json({ success: false, error: 'Session error' });
      }

      if (req.headers['content-type']?.includes('application/json')) {
        res.json({
          success: true,
          message: '2FA verified successfully',
          redirect: '/admin/dashboard'
        });
      } else {
        res.redirect('/admin/dashboard');
      }
    });
  } catch (error) {
    console.error('2FA verify error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /2fa/setup - Show 2FA setup page
router.get('/2fa/setup', requireAuth, async (req, res) => {
  try {
    const { secret, qrCodeUrl, backupCodes } = await TwoFactorService.generateSecret(req.user.email);

    res.render('2fa-setup', {
      title: '2FA Setup - KYRA',
      csrfToken: req.csrfToken?.() || '',
      secret,
      qrCodeUrl,
      backupCodes
    });
  } catch (error) {
    console.error('2FA setup error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /2fa/setup - Verify confirmation code and enable 2FA
router.post('/2fa/setup', requireAuth, async (req, res) => {
  try {
    const { token, secret, backupCodes } = req.body;

    if (!token || !secret || !backupCodes) {
      return res.status(400).json({
        success: false,
        error: 'Token, secret, and backup codes are required'
      });
    }

    // Verify the token against the secret
    if (!TwoFactorService.verifyToken(secret, token)) {
      return res.status(401).json({
        success: false,
        error: 'Invalid verification code'
      });
    }

    // Parse and hash backup codes
    const backupCodesArray = JSON.parse(backupCodes);
    const hashedCodes = await TwoFactorService.hashBackupCodes(backupCodesArray);

    // Enable 2FA
    const user = await UserService.getUserById(req.user.id, req.user.tenantId);
    await TwoFactorService.enableTotp(req.user.id, secret, hashedCodes);

    // Audit log
    await AuditLogService.createLog({
      userId: req.user.id,
      action: '2FA_ENABLED',
      resourceType: 'Authentication',
      status: 'success',
      tenantId: req.user.tenantId
    });

    if (req.headers['content-type']?.includes('application/json')) {
      res.json({
        success: true,
        message: '2FA enabled successfully',
        redirect: '/admin/settings'
      });
    } else {
      res.redirect(`/admin/settings?success=2FA enabled successfully`);
    }
  } catch (error) {
    console.error('2FA setup error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /2fa/disable - Disable 2FA
router.post('/2fa/disable', requireAuth, async (req, res) => {
  try {
    // Disable 2FA
    await TwoFactorService.disableTotp(req.user.id);

    // Audit log
    await AuditLogService.createLog({
      userId: req.user.id,
      action: '2FA_DISABLED',
      resourceType: 'Authentication',
      status: 'success',
      tenantId: req.user.tenantId
    });

    if (req.headers['content-type']?.includes('application/json')) {
      res.json({
        success: true,
        message: '2FA disabled',
        redirect: '/admin/settings'
      });
    } else {
      res.redirect('/admin/settings?success=2FA disabled');
    }
  } catch (error) {
    console.error('2FA disable error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
