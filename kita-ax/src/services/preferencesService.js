/**
 * User Preferences Service - Manage user settings and preferences
 */

const { UserPreferences } = require('../models');

class PreferencesService {
  /**
   * Get user preferences, create defaults if not exist
   */
  static async getPreferences(email, tenantId) {
    let prefs = await UserPreferences.findOne({
      where: { email, tenantId }
    });

    if (!prefs) {
      prefs = await UserPreferences.create({
        email,
        tenantId,
        theme: 'light',
        language: 'en',
        timezone: 'UTC',
        pageSize: 10,
        enableNotifications: true,
        notifyOnPolicyChange: true,
        notifyOnDocumentAccess: false,
        notifyOnFailedLogin: true,
        notifyDigestFrequency: 'daily',
        dashboardLayout: {
          widgets: ['metrics', 'recent-events', 'access-summary']
        }
      });
    }

    return prefs;
  }

  /**
   * Update user preferences
   */
  static async updatePreferences(email, tenantId, updates) {
    const prefs = await UserPreferences.findOne({
      where: { email, tenantId }
    });

    if (!prefs) {
      return UserPreferences.create({
        email,
        tenantId,
        ...updates
      });
    }

    // Validate theme
    if (updates.theme && !['light', 'dark', 'auto'].includes(updates.theme)) {
      throw new Error('Invalid theme value');
    }

    // Validate language
    if (updates.language && !/^[a-z]{2}(-[A-Z]{2})?$/.test(updates.language)) {
      throw new Error('Invalid language code');
    }

    // Validate page size
    if (updates.pageSize && (updates.pageSize < 5 || updates.pageSize > 100)) {
      throw new Error('Page size must be between 5 and 100');
    }

    // Validate notification frequency
    if (updates.notifyDigestFrequency && !['immediate', 'daily', 'weekly', 'never'].includes(updates.notifyDigestFrequency)) {
      throw new Error('Invalid notification frequency');
    }

    // Update allowed fields
    const allowedFields = [
      'theme',
      'language',
      'timezone',
      'pageSize',
      'enableNotifications',
      'notifyOnPolicyChange',
      'notifyOnDocumentAccess',
      'notifyOnFailedLogin',
      'notifyDigestFrequency',
      'dashboardLayout'
    ];

    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        prefs[key] = updates[key];
      }
    });

    await prefs.save();
    return prefs;
  }

  /**
   * Update single preference
   */
  static async updateSinglePreference(email, tenantId, key, value) {
    return PreferencesService.updatePreferences(email, tenantId, { [key]: value });
  }

  /**
   * Reset preferences to defaults
   */
  static async resetToDefaults(email, tenantId) {
    const prefs = await UserPreferences.findOne({
      where: { email, tenantId }
    });

    if (prefs) {
      await prefs.update({
        theme: 'light',
        language: 'en',
        timezone: 'UTC',
        pageSize: 10,
        enableNotifications: true,
        notifyOnPolicyChange: true,
        notifyOnDocumentAccess: false,
        notifyOnFailedLogin: true,
        notifyDigestFrequency: 'daily',
        dashboardLayout: {
          widgets: ['metrics', 'recent-events', 'access-summary']
        }
      });
    }

    return PreferencesService.getPreferences(email, tenantId);
  }

  /**
   * Get dashboard widget preferences
   */
  static async getDashboardLayout(email, tenantId) {
    const prefs = await PreferencesService.getPreferences(email, tenantId);
    return prefs.dashboardLayout || { widgets: ['metrics', 'recent-events', 'access-summary'] };
  }

  /**
   * Update dashboard widget configuration
   */
  static async updateDashboardLayout(email, tenantId, layout) {
    if (!Array.isArray(layout.widgets) || layout.widgets.length === 0) {
      throw new Error('Dashboard must have at least one widget');
    }

    const validWidgets = ['metrics', 'recent-events', 'access-summary', 'audit-trends', 'alerts'];
    const invalid = layout.widgets.filter(w => !validWidgets.includes(w));
    if (invalid.length > 0) {
      throw new Error(`Invalid widgets: ${invalid.join(', ')}`);
    }

    return PreferencesService.updatePreferences(email, tenantId, {
      dashboardLayout: layout
    });
  }

  /**
   * Get notification preferences
   */
  static async getNotificationPreferences(email, tenantId) {
    const prefs = await PreferencesService.getPreferences(email, tenantId);
    return {
      enabled: prefs.enableNotifications,
      policyChanges: prefs.notifyOnPolicyChange,
      documentAccess: prefs.notifyOnDocumentAccess,
      failedLogins: prefs.notifyOnFailedLogin,
      digestFrequency: prefs.notifyDigestFrequency
    };
  }

  /**
   * Update notification preferences
   */
  static async updateNotificationPreferences(email, tenantId, notifyPrefs) {
    const updates = {};

    if (notifyPrefs.enabled !== undefined) {
      updates.enableNotifications = notifyPrefs.enabled;
    }
    if (notifyPrefs.policyChanges !== undefined) {
      updates.notifyOnPolicyChange = notifyPrefs.policyChanges;
    }
    if (notifyPrefs.documentAccess !== undefined) {
      updates.notifyOnDocumentAccess = notifyPrefs.documentAccess;
    }
    if (notifyPrefs.failedLogins !== undefined) {
      updates.notifyOnFailedLogin = notifyPrefs.failedLogins;
    }
    if (notifyPrefs.digestFrequency !== undefined) {
      updates.notifyDigestFrequency = notifyPrefs.digestFrequency;
    }

    return PreferencesService.updatePreferences(email, tenantId, updates);
  }
}

module.exports = PreferencesService;
