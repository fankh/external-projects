/**
 * Two-Factor Authentication Service
 * Handles TOTP secret generation, verification, and backup code management
 */

const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const bcryptjs = require('bcryptjs');
const crypto = require('crypto');
const { User } = require('../config/database').sequelize.models;

class TwoFactorService {
  /**
   * Generate a new TOTP secret with QR code
   * @param {string} userEmail - User email for label
   * @returns {Promise<{ secret, otpauthUrl, qrCodeUrl, backupCodes }>}
   */
  static async generateSecret(userEmail) {
    // Generate TOTP secret
    const secret = speakeasy.generateSecret({
      name: `KYRA:${userEmail}`,
      issuer: 'KYRA',
      length: 32
    });

    // Generate backup codes (8 codes, hex format)
    const backupCodes = [];
    for (let i = 0; i < 8; i++) {
      backupCodes.push(crypto.randomBytes(4).toString('hex'));
    }

    // Generate QR code as data URL
    const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);

    return {
      secret: secret.base32,
      otpauthUrl: secret.otpauth_url,
      qrCodeUrl,
      backupCodes
    };
  }

  /**
   * Verify a TOTP token
   * @param {string} secret - Base32 encoded secret
   * @param {string} token - 6-digit TOTP token
   * @returns {boolean}
   */
  static verifyToken(secret, token) {
    if (!secret || !token) return false;

    try {
      return speakeasy.totp.verify({
        secret,
        encoding: 'base32',
        token,
        window: 1 // Allow 30 seconds drift
      });
    } catch (error) {
      console.error('TOTP verification error:', error.message);
      return false;
    }
  }

  /**
   * Hash backup codes for storage
   * @param {string[]} codes - Array of plaintext codes
   * @returns {Promise<string[]>}
   */
  static async hashBackupCodes(codes) {
    const hashed = [];
    for (const code of codes) {
      const hash = await bcryptjs.hash(code, 10);
      hashed.push(hash);
    }
    return hashed;
  }

  /**
   * Verify and consume a backup code
   * @param {User} user - User model instance
   * @param {string} inputCode - Code entered by user
   * @returns {Promise<boolean>}
   */
  static async verifyBackupCode(user, inputCode) {
    if (!user.totpBackupCodes || !Array.isArray(user.totpBackupCodes)) {
      return false;
    }

    for (let i = 0; i < user.totpBackupCodes.length; i++) {
      const hashedCode = user.totpBackupCodes[i];
      const isMatch = await bcryptjs.compare(inputCode, hashedCode);

      if (isMatch) {
        // Remove used code from array
        const updatedCodes = user.totpBackupCodes.filter((_, idx) => idx !== i);
        await user.update({ totpBackupCodes: updatedCodes });
        return true;
      }
    }

    return false;
  }

  /**
   * Enable TOTP for user
   * @param {string} userId - User ID
   * @param {string} secret - Base32 secret
   * @param {string[]} hashedBackupCodes - Hashed backup codes
   * @returns {Promise<User>}
   */
  static async enableTotp(userId, secret, hashedBackupCodes) {
    const user = await User.findByPk(userId);
    if (!user) throw new Error('User not found');

    return user.update({
      totpSecret: secret,
      totpEnabled: true,
      totpBackupCodes: hashedBackupCodes
    });
  }

  /**
   * Disable TOTP for user
   * @param {string} userId - User ID
   * @returns {Promise<User>}
   */
  static async disableTotp(userId) {
    const user = await User.findByPk(userId);
    if (!user) throw new Error('User not found');

    return user.update({
      totpSecret: null,
      totpEnabled: false,
      totpBackupCodes: null
    });
  }

  /**
   * Check if user has 2FA enabled
   * @param {string} userId - User ID
   * @returns {Promise<boolean>}
   */
  static async isTwoFactorEnabled(userId) {
    const user = await User.findByPk(userId);
    return user && user.totpEnabled;
  }
}

module.exports = TwoFactorService;
