/**
 * OAuth Account Service - Manage OAuth provider links
 */

const { OAuthAccount, User } = require('../models');

class OAuthService {
  /**
   * Create or update OAuth account
   */
  static async upsertOAuthAccount({ provider, providerId, email, name, picture, accessToken, refreshToken, tenantId }) {
    const account = await OAuthAccount.findOne({
      where: { provider, providerId }
    });

    if (account) {
      account.email = email;
      account.name = name;
      account.picture = picture;
      if (accessToken) account.accessToken = accessToken;
      if (refreshToken) account.refreshToken = refreshToken;
      await account.save();
      return account;
    }

    return OAuthAccount.create({
      provider,
      providerId,
      email,
      name,
      picture,
      accessToken,
      refreshToken,
      tenantId
    });
  }

  /**
   * Get OAuth account by provider and ID
   */
  static async getOAuthAccount(provider, providerId) {
    return OAuthAccount.findOne({
      where: { provider, providerId }
    });
  }

  /**
   * Get all OAuth accounts for a user
   */
  static async getUserOAuthAccounts(email, tenantId) {
    return OAuthAccount.findAll({
      where: { email, tenantId },
      order: [['createdAt', 'DESC']]
    });
  }

  /**
   * Link OAuth account to existing user
   */
  static async linkOAuthAccount(existingEmail, provider, providerId, oauthData, tenantId) {
    // Check if OAuth account already linked to different user
    const existing = await OAuthAccount.findOne({
      where: { provider, providerId }
    });

    if (existing && existing.email !== existingEmail) {
      throw new Error(`This ${provider} account is already linked to another user`);
    }

    // Link the account
    return OAuthService.upsertOAuthAccount({
      provider,
      providerId,
      email: existingEmail,
      name: oauthData.name,
      picture: oauthData.picture,
      accessToken: oauthData.accessToken,
      refreshToken: oauthData.refreshToken,
      tenantId
    });
  }

  /**
   * Unlink OAuth account
   */
  static async unlinkOAuthAccount(email, provider, tenantId) {
    const result = await OAuthAccount.destroy({
      where: { email, provider, tenantId }
    });

    return result > 0;
  }

  /**
   * Get or create user from OAuth
   */
  static async getOrCreateUserFromOAuth({ provider, providerId, email, name, picture }, tenantId) {
    // Check if OAuth account exists
    const oauthAccount = await OAuthService.getOAuthAccount(provider, providerId);

    if (oauthAccount) {
      // Get existing user
      const user = await User.findOne({
        where: { email: oauthAccount.email, tenantId }
      });

      if (!user) {
        throw new Error(`User not found for OAuth account`);
      }

      // Update last login
      await user.update({ lastLogin: new Date() });

      return {
        user,
        isNewUser: false,
        oauthAccount
      };
    }

    // Try to find user by email
    let user = await User.findOne({
      where: { email, tenantId }
    });

    if (user) {
      // Link OAuth to existing user
      await OAuthService.linkOAuthAccount(email, provider, providerId, {
        name,
        picture,
        accessToken: null,
        refreshToken: null
      }, tenantId);

      await user.update({ lastLogin: new Date() });

      return {
        user,
        isNewUser: false,
        linked: true
      };
    }

    // Create new user if OAuth login is enabled for new users
    if (process.env.OAUTH_AUTO_CREATE_USERS === 'true') {
      user = await User.create({
        email,
        passwordHash: null,
        role: 'viewer',
        tenantId,
        status: 'active',
        lastLogin: new Date()
      });

      // Link the OAuth account
      await OAuthService.upsertOAuthAccount({
        provider,
        providerId,
        email,
        name,
        picture,
        accessToken: null,
        refreshToken: null,
        tenantId
      });

      return {
        user,
        isNewUser: true
      };
    }

    // User not found and auto-create disabled
    throw new Error(`User with email ${email} not found. Contact administrator to create account.`);
  }
}

module.exports = OAuthService;
