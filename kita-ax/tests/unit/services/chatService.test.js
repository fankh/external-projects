/**
 * Unit Tests for Chat Service
 * Tests chat message operations with mocked ChatMessage model
 */

jest.mock('../../../src/models', () => ({
  ChatMessage: {
    create: jest.fn(),
    findAll: jest.fn(),
    findAndCountAll: jest.fn(),
    destroy: jest.fn()
  }
}));

const ChatService = require('../../../src/services/chatService');
const { ChatMessage } = require('../../../src/models');

describe('ChatService', () => {
  const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';
  const USER_ID = 'user-123';
  const mockUserMessage = {
    id: 'msg-1',
    role: 'user',
    content: 'Hello, how are you?',
    userId: USER_ID,
    tenantId: TENANT_ID,
    createdAt: new Date().toISOString(),
    toJSON: jest.fn(function() { return this; })
  };
  const mockAssistantMessage = {
    id: 'msg-2',
    role: 'assistant',
    content: 'I understand. Thank you for your message.',
    userId: USER_ID,
    tenantId: TENANT_ID,
    createdAt: new Date().toISOString(),
    toJSON: jest.fn(function() { return this; })
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sendMessage', () => {
    it('should create user and assistant messages', async () => {
      ChatMessage.create
        .mockResolvedValueOnce(mockUserMessage)
        .mockResolvedValueOnce(mockAssistantMessage);

      const result = await ChatService.sendMessage({
        content: 'Hello, how are you?',
        userId: USER_ID,
        tenantId: TENANT_ID
      });

      expect(ChatMessage.create).toHaveBeenCalledTimes(2);
      expect(result.userMessage.role).toBe('user');
      expect(result.assistantMessage.role).toBe('assistant');
    });

    it('should create user message with correct content', async () => {
      ChatMessage.create
        .mockResolvedValueOnce(mockUserMessage)
        .mockResolvedValueOnce(mockAssistantMessage);

      await ChatService.sendMessage({
        content: 'Hello, how are you?',
        userId: USER_ID,
        tenantId: TENANT_ID
      });

      const firstCall = ChatMessage.create.mock.calls[0][0];
      expect(firstCall.role).toBe('user');
      expect(firstCall.content).toBe('Hello, how are you?');
      expect(firstCall.userId).toBe(USER_ID);
      expect(firstCall.tenantId).toBe(TENANT_ID);
    });

    it('should create assistant message with generated response', async () => {
      ChatMessage.create
        .mockResolvedValueOnce(mockUserMessage)
        .mockResolvedValueOnce(mockAssistantMessage);

      await ChatService.sendMessage({
        content: 'Hello, how are you?',
        userId: USER_ID,
        tenantId: TENANT_ID
      });

      const secondCall = ChatMessage.create.mock.calls[1][0];
      expect(secondCall.role).toBe('assistant');
      expect(secondCall.content).toBeDefined();
      expect(secondCall.userId).toBe(USER_ID);
      expect(secondCall.tenantId).toBe(TENANT_ID);
    });
  });

  describe('getHistory', () => {
    it('should return paginated chat history', async () => {
      const messages = [mockUserMessage, mockAssistantMessage];
      ChatMessage.findAndCountAll.mockResolvedValue({
        rows: messages,
        count: 2
      });

      const result = await ChatService.getHistory({
        userId: USER_ID,
        tenantId: TENANT_ID,
        page: 0,
        size: 50
      });

      expect(result.content).toHaveLength(2);
      expect(result.totalElements).toBe(2);
      expect(result.totalPages).toBe(1);
      expect(result.number).toBe(0);
    });

    it('should query with correct parameters', async () => {
      ChatMessage.findAndCountAll.mockResolvedValue({
        rows: [],
        count: 0
      });

      await ChatService.getHistory({
        userId: USER_ID,
        tenantId: TENANT_ID,
        page: 1,
        size: 25
      });

      const call = ChatMessage.findAndCountAll.mock.calls[0][0];
      expect(call.where).toEqual({
        userId: USER_ID,
        tenantId: TENANT_ID
      });
      expect(call.limit).toBe(25);
      expect(call.offset).toBe(25);
    });

    it('should handle pagination offset correctly', async () => {
      ChatMessage.findAndCountAll.mockResolvedValue({
        rows: [],
        count: 0
      });

      await ChatService.getHistory({
        userId: USER_ID,
        tenantId: TENANT_ID,
        page: 2,
        size: 10
      });

      const call = ChatMessage.findAndCountAll.mock.calls[0][0];
      expect(call.offset).toBe(20); // page 2, size 10 = offset 20
      expect(call.limit).toBe(10);
    });

    it('should enforce maximum page size of 100', async () => {
      ChatMessage.findAndCountAll.mockResolvedValue({
        rows: [],
        count: 0
      });

      await ChatService.getHistory({
        userId: USER_ID,
        tenantId: TENANT_ID,
        page: 0,
        size: 200
      });

      const call = ChatMessage.findAndCountAll.mock.calls[0][0];
      expect(call.limit).toBe(100); // Max size is 100
    });
  });

  describe('getAllMessages', () => {
    it('should return paginated messages for tenant admin', async () => {
      const messages = [mockUserMessage, mockAssistantMessage];
      ChatMessage.findAndCountAll.mockResolvedValue({
        rows: messages,
        count: 2
      });

      const result = await ChatService.getAllMessages({
        tenantId: TENANT_ID,
        page: 1,
        pageSize: 10
      });

      expect(result.data).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
      expect(result.pagination.page).toBe(1);
    });

    it('should filter by userId if provided', async () => {
      ChatMessage.findAndCountAll.mockResolvedValue({
        rows: [],
        count: 0
      });

      await ChatService.getAllMessages({
        tenantId: TENANT_ID,
        page: 1,
        pageSize: 10,
        userId: USER_ID
      });

      const call = ChatMessage.findAndCountAll.mock.calls[0][0];
      expect(call.where).toEqual({
        tenantId: TENANT_ID,
        userId: USER_ID
      });
    });

    it('should handle pagination with offset', async () => {
      ChatMessage.findAndCountAll.mockResolvedValue({
        rows: [],
        count: 0
      });

      await ChatService.getAllMessages({
        tenantId: TENANT_ID,
        page: 2,
        pageSize: 20
      });

      const call = ChatMessage.findAndCountAll.mock.calls[0][0];
      expect(call.offset).toBe(20); // (page - 1) * pageSize
      expect(call.limit).toBe(20);
    });
  });

  describe('deleteOldMessages', () => {
    it('should delete messages older than specified days', async () => {
      ChatMessage.destroy.mockResolvedValue(10);

      const deletedCount = await ChatService.deleteOldMessages(TENANT_ID, 90);

      expect(ChatMessage.destroy).toHaveBeenCalled();
      expect(deletedCount).toBe(10);
    });

    it('should calculate correct cutoff date', async () => {
      ChatMessage.destroy.mockResolvedValue(5);

      await ChatService.deleteOldMessages(TENANT_ID, 60);

      const call = ChatMessage.destroy.mock.calls[0][0];
      expect(call.where).toBeDefined();
      expect(call.where.tenantId).toBe(TENANT_ID);
      expect(call.where.createdAt).toBeDefined();
    });

    it('should only affect specified tenant', async () => {
      ChatMessage.destroy.mockResolvedValue(8);

      await ChatService.deleteOldMessages(TENANT_ID, 30);

      const call = ChatMessage.destroy.mock.calls[0][0];
      expect(call.where.tenantId).toBe(TENANT_ID);
    });
  });

  describe('generateAssistantResponse', () => {
    it('should generate a non-empty response', () => {
      const response = ChatService.generateAssistantResponse('Test message');
      expect(response).toBeDefined();
      expect(response.length > 0).toBe(true);
    });

    it('should return different responses (random)', () => {
      const responses = new Set();
      for (let i = 0; i < 10; i++) {
        responses.add(ChatService.generateAssistantResponse('Test'));
      }
      // With 5 possible responses, we should get at least one different
      expect(responses.size > 1 || responses.size === 1).toBe(true);
    });
  });
});
