/**
 * Authentication Routes for KYRA Admin Console
 */

const express = require('express');
const router = express.Router();
const { loginLimiter } = require('../middleware/security');

// Mock user database (replace with real database)
const mockUsers = {
  'admin@seekerslab.com': {
    id: '1',
    email: 'admin@seekerslab.com',
    password: 'xmUoX0OA5XvSH4csBJbw', // In production, use bcrypt
    name: 'Admin User',
    role: 'admin',
    tenantId: 'tenant-1',
    status: 'active'
  }
};

// GET /login - Show login page
router.get('/login', (req, res) => {
  res.render('login', {
    title: 'Login - KYRA Admin Console',
    csrfToken: req.csrfToken?.() || ''
  });
});

// POST /login - Process login
router.post('/login', loginLimiter, (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    // Find user (in production, query database)
    const user = mockUsers[email];

    if (!user || user.password !== password) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    // Check if user is active
    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        error: 'User account is inactive'
      });
    }

    // Set session
    req.session.userId = user.id;
    req.session.email = user.email;
    req.session.role = user.role;
    req.session.tenantId = user.tenantId;
    req.session.name = user.name;

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

module.exports = router;
