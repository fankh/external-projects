/**
 * Passport Configuration for OAuth
 * Supports Google and GitHub OAuth providers
 */

const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github').Strategy;
const { User } = require('../models');
const OAuthService = require('../services/oauthService');

const TENANT_ID = process.env.DEFAULT_TENANT_ID || '550e8400-e29b-41d4-a716-446655440000';

// Serialize user to session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findByPk(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

// Google OAuth Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback',
        proxy: true
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const result = await OAuthService.getOrCreateUserFromOAuth(
            {
              provider: 'google',
              providerId: profile.id,
              email: profile.emails[0].value,
              name: profile.displayName,
              picture: profile.photos[0]?.value
            },
            TENANT_ID
          );

          // Update OAuth tokens
          await OAuthService.upsertOAuthAccount({
            provider: 'google',
            providerId: profile.id,
            email: result.user.email,
            name: profile.displayName,
            picture: profile.photos[0]?.value,
            accessToken,
            refreshToken,
            tenantId: TENANT_ID
          });

          done(null, result.user);
        } catch (err) {
          done(err);
        }
      }
    )
  );
}

// GitHub OAuth Strategy
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: process.env.GITHUB_CALLBACK_URL || '/auth/github/callback',
        userAgent: 'kyra-admin-console'
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          // GitHub may not provide email in profile, check emails
          let email = profile.emails?.[0]?.value;
          if (!email && profile.email) {
            email = profile.email;
          }

          if (!email) {
            return done(new Error('No email found in GitHub profile'));
          }

          const result = await OAuthService.getOrCreateUserFromOAuth(
            {
              provider: 'github',
              providerId: profile.id.toString(),
              email,
              name: profile.displayName || profile.username,
              picture: profile.photos[0]?.value
            },
            TENANT_ID
          );

          // Update OAuth tokens
          await OAuthService.upsertOAuthAccount({
            provider: 'github',
            providerId: profile.id.toString(),
            email: result.user.email,
            name: profile.displayName || profile.username,
            picture: profile.photos[0]?.value,
            accessToken,
            refreshToken,
            tenantId: TENANT_ID
          });

          done(null, result.user);
        } catch (err) {
          done(err);
        }
      }
    )
  );
}

module.exports = passport;
