/**
 * User Preferences Middleware
 * Loads user preferences and makes them available to views and handlers
 */

const PreferencesService = require('../services/preferencesService');

const preferencesMiddleware = async (req, res, next) => {
  // Only load preferences for authenticated users
  if (req.user && req.session.userId) {
    try {
      const preferences = await PreferencesService.getPreferences(req.user.email, req.user.tenantId);

      // Store in request for easy access
      req.preferences = preferences.dataValues || preferences;

      // Make available to views
      res.locals.userTheme = req.preferences.theme;
      res.locals.userLanguage = req.preferences.language;
      res.locals.userPageSize = req.preferences.pageSize;
      res.locals.userPreferences = req.preferences;
    } catch (err) {
      console.warn('Failed to load user preferences:', err.message);
      // Continue without preferences on error
    }
  }

  next();
};

module.exports = preferencesMiddleware;
