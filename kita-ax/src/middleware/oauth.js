/**
 * OAuth Middleware
 */

const passport = require('passport');
require('../config/passport');

// OAuth authentication middleware
const googleAuth = passport.authenticate('google', { scope: ['profile', 'email'] });
const githubAuth = passport.authenticate('github', { scope: ['user:email'] });

// OAuth callback handlers
const googleCallback = passport.authenticate('google', { failureRedirect: '/login?error=google_auth_failed' });
const githubCallback = passport.authenticate('github', { failureRedirect: '/login?error=github_auth_failed' });

// Generic OAuth callback handler
function oauthCallback(req, res) {
  if (!req.user) {
    return res.redirect('/login?error=oauth_failed');
  }

  // Set session
  req.session.userId = req.user.id;
  req.session.email = req.user.email;
  req.session.role = req.user.role;
  req.session.tenantId = req.user.tenantId;
  req.session.name = req.user.email;

  req.session.save((err) => {
    if (err) {
      console.error('Session save error:', err);
      return res.redirect('/login?error=session_failed');
    }

    // Redirect to dashboard or requested page
    const redirect = req.query.state || '/admin/dashboard';
    res.redirect(redirect);
  });
}

module.exports = {
  googleAuth,
  githubAuth,
  googleCallback,
  githubCallback,
  oauthCallback
};
