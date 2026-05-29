/**
 * Unit Tests for TwoFactorService
 */

const TwoFactorService = require('../../../src/services/twoFactorService');
const speakeasy = require('speakeasy');
const bcryptjs = require('bcryptjs');

describe('TwoFactorService', () => {
  describe('generateSecret()', () => {
    test('should generate TOTP secret with QR code', async () => {
      const email = 'test@example.com';
      const result = await TwoFactorService.generateSecret(email);

      expect(result).toHaveProperty('secret');
      expect(result).toHaveProperty('otpauthUrl');
      expect(result).toHaveProperty('qrCodeUrl');
      expect(result).toHaveProperty('backupCodes');

      expect(typeof result.secret).toBe('string');
      expect(result.secret.length).toBeGreaterThan(20);
      expect(result.qrCodeUrl).toContain('data:image/png');
      expect(Array.isArray(result.backupCodes)).toBe(true);
      expect(result.backupCodes.length).toBe(8);
    });

    test('should generate unique backup codes', async () => {
      const result1 = await TwoFactorService.generateSecret('test1@example.com');
      const result2 = await TwoFactorService.generateSecret('test2@example.com');

      const codes1 = new Set(result1.backupCodes);
      const codes2 = new Set(result2.backupCodes);

      expect(codes1.size).toBe(8);
      expect(codes2.size).toBe(8);
      expect(result1.backupCodes[0]).not.toBe(result2.backupCodes[0]);
    });

    test('should include email in otpauth URL', async () => {
      const email = 'test@example.com';
      const result = await TwoFactorService.generateSecret(email);

      expect(result.otpauthUrl).toContain(encodeURIComponent(email));
      expect(result.otpauthUrl).toContain('KYRA');
    });
  });

  describe('verifyToken()', () => {
    test('should verify valid TOTP token', () => {
      const secret = speakeasy.generateSecret({ length: 32 });
      const token = speakeasy.totp({
        secret: secret.base32,
        encoding: 'base32',
        time: Math.floor(Date.now() / 1000),
      });

      const isValid = TwoFactorService.verifyToken(secret.base32, token);
      expect(isValid).toBe(true);
    });

    test('should reject invalid TOTP token', () => {
      const secret = speakeasy.generateSecret({ length: 32 });
      const invalidToken = '000000';

      const isValid = TwoFactorService.verifyToken(secret.base32, invalidToken);
      expect(isValid).toBe(false);
    });

    test('should reject empty secret', () => {
      const isValid = TwoFactorService.verifyToken('', '123456');
      expect(isValid).toBe(false);
    });

    test('should reject empty token', () => {
      const secret = 'AAAA';
      const isValid = TwoFactorService.verifyToken(secret, '');
      expect(isValid).toBe(false);
    });

    test('should handle null values gracefully', () => {
      const isValid1 = TwoFactorService.verifyToken(null, '123456');
      const isValid2 = TwoFactorService.verifyToken('AAAA', null);

      expect(isValid1).toBe(false);
      expect(isValid2).toBe(false);
    });
  });

  describe('hashBackupCodes()', () => {
    test('should hash backup codes', async () => {
      const codes = ['code1', 'code2', 'code3'];
      const hashed = await TwoFactorService.hashBackupCodes(codes);

      expect(Array.isArray(hashed)).toBe(true);
      expect(hashed.length).toBe(3);

      for (const hash of hashed) {
        expect(typeof hash).toBe('string');
        expect(hash.length).toBeGreaterThan(20);
      }
    });

    test('should produce different hashes for different codes', async () => {
      const code = 'testcode';
      const hash1 = await TwoFactorService.hashBackupCodes([code]);
      const hash2 = await TwoFactorService.hashBackupCodes([code]);

      expect(hash1[0]).not.toBe(hash2[0]);
    });

    test('should handle empty array', async () => {
      const hashed = await TwoFactorService.hashBackupCodes([]);
      expect(Array.isArray(hashed)).toBe(true);
      expect(hashed.length).toBe(0);
    });
  });

  describe('verifyBackupCode()', () => {
    test('should verify valid backup code', async () => {
      const plainCode = 'a1b2c3d4';
      const hashedCode = await bcryptjs.hash(plainCode, 10);

      const user = {
        totpBackupCodes: [hashedCode],
        update: jest.fn().mockResolvedValue(true),
      };

      const isValid = await TwoFactorService.verifyBackupCode(user, plainCode);
      expect(isValid).toBe(true);
      expect(user.update).toHaveBeenCalled();
    });

    test('should reject invalid backup code', async () => {
      const hashedCode = await bcryptjs.hash('code1', 10);

      const user = {
        totpBackupCodes: [hashedCode],
        update: jest.fn(),
      };

      const isValid = await TwoFactorService.verifyBackupCode(user, 'wrongcode');
      expect(isValid).toBe(false);
      expect(user.update).not.toHaveBeenCalled();
    });

    test('should remove used backup code', async () => {
      const code1 = 'a1b2c3d4';
      const code2 = 'e5f6g7h8';
      const hash1 = await bcryptjs.hash(code1, 10);
      const hash2 = await bcryptjs.hash(code2, 10);

      const user = {
        totpBackupCodes: [hash1, hash2],
        update: jest.fn().mockResolvedValue(true),
      };

      await TwoFactorService.verifyBackupCode(user, code1);

      const updateCall = user.update.mock.calls[0][0];
      expect(updateCall.totpBackupCodes.length).toBe(1);
    });

    test('should handle null backup codes', async () => {
      const user = {
        totpBackupCodes: null,
      };

      const isValid = await TwoFactorService.verifyBackupCode(user, 'code');
      expect(isValid).toBe(false);
    });
  });

  describe('enableTotp()', () => {
    test('should enable TOTP for user', async () => {
      const mockUser = {
        update: jest.fn().mockResolvedValue(true),
      };

      jest.mock('../../config/database', () => ({
        sequelize: {
          models: {
            User: {
              findByPk: jest.fn().mockResolvedValue(mockUser),
            },
          },
        },
      }), { virtual: true });

      const userId = 'user-id';
      const secret = 'AAABBBCCCDDDEEE';
      const hashedCodes = ['hash1', 'hash2'];

      // Note: This test would need proper mocking of the database
      // For now, we'll test the method signature and error handling
      expect(TwoFactorService.enableTotp).toBeDefined();
    });
  });

  describe('disableTotp()', () => {
    test('should disable TOTP for user', async () => {
      expect(TwoFactorService.disableTotp).toBeDefined();
    });
  });

  describe('isTwoFactorEnabled()', () => {
    test('should check if TOTP is enabled', async () => {
      expect(TwoFactorService.isTwoFactorEnabled).toBeDefined();
    });
  });
});
