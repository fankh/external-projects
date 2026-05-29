/**
 * Unit Tests for User Service
 * Tests all user-related operations with mocked Sequelize models
 */

jest.mock('../../../src/models', () => ({
  User: {
    findOne: jest.fn(),
    findByPk: jest.fn(),
    findAndCountAll: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
  }
}));

const UserService = require('../../../src/services/userService');
const { User } = require('../../../src/models');
const bcryptjs = require('bcryptjs');

describe('UserService', () => {
  const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    passwordHash: bcryptjs.hashSync('password123', 10),
    role: 'admin',
    tenantId: TENANT_ID,
    status: 'active',
    update: jest.fn().mockResolvedValue({}),
    save: jest.fn().mockResolvedValue({}),
    destroy: jest.fn().mockResolvedValue({}),
    toJSON: jest.fn(() => ({ id: 'user-123', email: 'test@example.com', role: 'admin' }))
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserById', () => {
    it('should return user when found', async () => {
      User.findOne.mockResolvedValue(mockUser);
      const user = await UserService.getUserById('user-123', TENANT_ID);
      expect(user).toBeDefined();
      expect(user.email).toBe('test@example.com');
    });

    it('should throw when user not found', async () => {
      User.findOne.mockResolvedValue(null);
      await expect(UserService.getUserById('not-found', TENANT_ID)).rejects.toThrow();
    });

    it('should call findOne with user id and tenantId', async () => {
      User.findOne.mockResolvedValue(mockUser);
      await UserService.getUserById('user-123', TENANT_ID);
      expect(User.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'user-123',
            tenantId: TENANT_ID
          })
        })
      );
    });
  });

  describe('getUserByEmail', () => {
    it('should return user when found', async () => {
      User.findOne.mockResolvedValue(mockUser);
      const user = await UserService.getUserByEmail('test@example.com', TENANT_ID);
      expect(user.email).toBe('test@example.com');
    });

    it('should throw when user not found', async () => {
      User.findOne.mockResolvedValue(null);
      await expect(UserService.getUserByEmail('not-found@example.com', TENANT_ID)).rejects.toThrow();
    });

    it('should search by email and tenantId', async () => {
      User.findOne.mockResolvedValue(mockUser);
      await UserService.getUserByEmail('test@example.com', TENANT_ID);
      expect(User.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            email: 'test@example.com',
            tenantId: TENANT_ID
          })
        })
      );
    });
  });

  describe('verifyPassword', () => {
    it('should return true for correct password', async () => {
      const hashedPassword = bcryptjs.hashSync('correct-password', 10);
      const user = { ...mockUser, passwordHash: hashedPassword };
      User.findOne.mockResolvedValue(user);

      const result = await UserService.verifyPassword('test@example.com', 'correct-password', TENANT_ID);
      expect(result).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      User.findOne.mockResolvedValue(mockUser);
      const result = await UserService.verifyPassword('test@example.com', 'wrong-password', TENANT_ID);
      expect(result).toBe(false);
    });

    it('should return false when user not found', async () => {
      User.findOne.mockResolvedValue(null);
      const result = await UserService.verifyPassword('not-found@example.com', 'password', TENANT_ID);
      expect(result).toBe(false);
    });
  });

  describe('createUser', () => {
    it('should create user with hashed password', async () => {
      const newUser = { id: 'new-user', email: 'new@example.com', role: 'editor' };
      User.findOne.mockResolvedValueOnce(null); // Check existing user
      User.create.mockResolvedValue(newUser);
      User.findOne.mockResolvedValueOnce(newUser); // Get user after create

      const user = await UserService.createUser({
        email: 'new@example.com',
        password: 'SecurePass123',
        role: 'editor',
        tenantId: TENANT_ID
      });

      expect(User.create).toHaveBeenCalled();
      const call = User.create.mock.calls[0][0];
      expect(call.email).toBe('new@example.com');
      expect(call.passwordHash).toBeDefined();
    });

    it('should hash password before storage', async () => {
      User.findOne.mockResolvedValueOnce(null); // Check existing user
      User.create.mockResolvedValue(mockUser);
      User.findOne.mockResolvedValueOnce(mockUser); // Get user after create

      await UserService.createUser({
        email: 'test@example.com',
        password: 'password123',
        tenantId: TENANT_ID
      });

      const call = User.create.mock.calls[0][0];
      expect(call.passwordHash).not.toBe('password123'); // Should be hashed
      expect(call.passwordHash).toHaveLength(60); // bcrypt hash length
    });

    it('should set default role if not provided', async () => {
      User.findOne.mockResolvedValueOnce(null); // Check existing user
      User.create.mockResolvedValue(mockUser);
      User.findOne.mockResolvedValueOnce(mockUser); // Get user after create

      await UserService.createUser({
        email: 'test@example.com',
        password: 'password123',
        tenantId: TENANT_ID
      });

      const call = User.create.mock.calls[0][0];
      expect(call.role).toBe('viewer'); // default
    });
  });

  describe('updateLastLogin', () => {
    it('should update lastLogin timestamp when user found', async () => {
      User.findOne.mockResolvedValue(mockUser);
      await UserService.updateLastLogin('test@example.com', TENANT_ID);
      expect(mockUser.save).toHaveBeenCalled();
    });

    it('should silently return if user not found', async () => {
      User.findOne.mockResolvedValue(null);
      await expect(UserService.updateLastLogin('not-found@example.com', TENANT_ID)).resolves.not.toThrow();
    });
  });

  describe('updateUser', () => {
    it('should update user fields', async () => {
      User.findOne.mockResolvedValueOnce(mockUser); // First call to find user
      User.findOne.mockResolvedValueOnce(mockUser); // Second call in getUserById
      await UserService.updateUser('user-123', { role: 'editor', status: 'inactive' }, TENANT_ID);
      expect(mockUser.save).toHaveBeenCalled();
    });

    it('should throw when user not found', async () => {
      User.findOne.mockResolvedValue(null);
      await expect(UserService.updateUser('not-found', {}, TENANT_ID)).rejects.toThrow();
    });
  });

  describe('deleteUser', () => {
    it('should delete user from database', async () => {
      User.findOne.mockResolvedValue(mockUser);
      await UserService.deleteUser('user-123', TENANT_ID);
      expect(mockUser.destroy).toHaveBeenCalled();
    });

    it('should throw when user not found', async () => {
      User.findOne.mockResolvedValue(null);
      await expect(UserService.deleteUser('not-found', TENANT_ID)).rejects.toThrow();
    });
  });

  describe('getAllUsers', () => {
    it('should return paginated user list', async () => {
      const users = [mockUser, { ...mockUser, id: 'user-456' }];
      User.findAndCountAll.mockResolvedValue({ rows: users, count: 2 });

      const result = await UserService.getAllUsers({
        page: 1,
        pageSize: 10,
        tenantId: TENANT_ID
      });

      expect(result.data).toHaveLength(2);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.pageSize).toBe(10);
      expect(result.pagination.total).toBe(2);
    });

    it('should handle pagination with offset', async () => {
      User.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
      await UserService.getAllUsers({
        page: 2,
        pageSize: 20,
        tenantId: TENANT_ID
      });

      const call = User.findAndCountAll.mock.calls[0][0];
      expect(call.offset).toBe(20); // (page - 1) * pageSize
      expect(call.limit).toBe(20);
    });

    it('should handle search filter', async () => {
      User.findAndCountAll.mockResolvedValue({ rows: [mockUser], count: 1 });
      await UserService.getAllUsers({
        page: 1,
        pageSize: 10,
        search: 'john',
        tenantId: TENANT_ID
      });

      const call = User.findAndCountAll.mock.calls[0][0];
      expect(call.where).toBeDefined();
    });

    it('should filter by status', async () => {
      User.findAndCountAll.mockResolvedValue({ rows: [mockUser], count: 1 });
      await UserService.getAllUsers({
        page: 1,
        pageSize: 10,
        status: 'active',
        tenantId: TENANT_ID
      });

      const call = User.findAndCountAll.mock.calls[0][0];
      expect(call.where).toBeDefined();
    });
  });

  describe('countByRole', () => {
    it('should count users by role', async () => {
      User.count.mockResolvedValue(5);
      const count = await UserService.countByRole('admin', TENANT_ID);
      expect(count).toBe(5);
    });

    it('should call count with role and tenantId', async () => {
      User.count.mockResolvedValue(3);
      await UserService.countByRole('editor', TENANT_ID);
      expect(User.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            role: 'editor',
            tenantId: TENANT_ID
          })
        })
      );
    });
  });
});
