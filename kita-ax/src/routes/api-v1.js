const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { validateRequest, validatePagination } = require('../middleware/validation');
const serializers = require('../schemas/serializers');

// Service imports
const UserService = require('../services/userService');
const DocumentService = require('../services/documentService');
const RoleService = require('../services/roleService');
const AuditLogService = require('../services/auditLogService');
const PolicyService = require('../services/policyService');
const AgentService = require('../services/agentService');
const ChatService = require('../services/chatService');

// Apply auth middleware to all API routes
router.use(requireAuth);
router.use(requireAdmin);

// Error handler wrapper for async routes
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ===== USERS API =====

router.get('/users', validatePagination, asyncHandler(async (req, res) => {
  try {
    const { page, pageSize, search, status, role, sortBy, sortOrder } = req.query;

    const result = await UserService.getAllUsers({
      page: parseInt(page) || 1,
      pageSize: parseInt(pageSize) || 10,
      search,
      status,
      role,
      sortBy: sortBy || 'email',
      sortOrder: sortOrder || 'asc',
      tenantId: req.user.tenantId
    });

    res.json({
      success: true,
      data: result.data.map(u => ({
        id: u.id,
        email: u.email,
        role: u.role,
        status: u.status,
        lastLogin: u.lastLogin,
        createdAt: u.createdAt
      })),
      pagination: result.pagination,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json(serializers.errorResponse(error.message, 'DATABASE_ERROR'));
  }
}));

router.get('/users/:id', asyncHandler(async (req, res) => {
  try {
    const user = await UserService.getUserById(req.params.id, req.user.tenantId);
    res.json(serializers.successResponse({
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt
    }));
  } catch (error) {
    res.status(404).json(serializers.errorResponse(error.message, 'USER_NOT_FOUND'));
  }
}));

router.post('/users', validateRequest('user.create'), asyncHandler(async (req, res) => {
  try {
    const { email, password, role } = req.body;

    const user = await UserService.createUser({
      email,
      password,
      role,
      tenantId: req.user.tenantId,
      status: 'active'
    });

    res.status(201).json(serializers.successResponse({
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt
    }));
  } catch (error) {
    res.status(400).json(serializers.errorResponse(error.message, 'USER_CREATION_FAILED'));
  }
}));

router.put('/users/:id', validateRequest('user.update'), asyncHandler(async (req, res) => {
  try {
    const { email, role, status } = req.body;

    const user = await UserService.updateUser(
      req.params.id,
      { email, role, status },
      req.user.tenantId
    );

    res.json(serializers.successResponse({
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      updatedAt: user.updatedAt
    }));
  } catch (error) {
    res.status(400).json(serializers.errorResponse(error.message, 'USER_UPDATE_FAILED'));
  }
}));

router.delete('/users/:id', asyncHandler(async (req, res) => {
  try {
    await UserService.deleteUser(req.params.id, req.user.tenantId);
    res.json(serializers.successResponse({ success: true }));
  } catch (error) {
    res.status(400).json(serializers.errorResponse(error.message, 'USER_DELETE_FAILED'));
  }
}));

// ===== DOCUMENTS API =====

router.get('/documents', validatePagination, asyncHandler(async (req, res) => {
  try {
    const { page, pageSize, search, classification, sortBy, sortOrder } = req.query;

    const result = await DocumentService.getAllDocuments({
      page: parseInt(page) || 1,
      pageSize: parseInt(pageSize) || 10,
      search,
      classification,
      sortBy: sortBy || 'createdAt',
      sortOrder: sortOrder || 'desc',
      tenantId: req.user.tenantId
    });

    res.json({
      success: true,
      data: result.data.map(d => ({
        id: d.id,
        title: d.title,
        classification: d.classification,
        owner: d.owner,
        accessCount: d.accessCount,
        size: d.size,
        createdAt: d.createdAt
      })),
      pagination: result.pagination,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json(serializers.errorResponse(error.message, 'DATABASE_ERROR'));
  }
}));

router.get('/documents/:id', asyncHandler(async (req, res) => {
  try {
    const doc = await DocumentService.getDocumentById(req.params.id, req.user.tenantId);
    res.json(serializers.successResponse({
      id: doc.id,
      title: doc.title,
      classification: doc.classification,
      owner: doc.owner,
      accessCount: doc.accessCount,
      size: doc.size,
      description: doc.description,
      createdAt: doc.createdAt
    }));
  } catch (error) {
    res.status(404).json(serializers.errorResponse(error.message, 'DOCUMENT_NOT_FOUND'));
  }
}));

router.post('/documents', validateRequest('document.create'), asyncHandler(async (req, res) => {
  try {
    const { title, classification, owner, description } = req.body;

    const doc = await DocumentService.createDocument({
      title,
      classification,
      owner,
      description,
      tenantId: req.user.tenantId
    });

    res.status(201).json(serializers.successResponse({
      id: doc.id,
      title: doc.title,
      classification: doc.classification,
      owner: doc.owner,
      createdAt: doc.createdAt
    }));
  } catch (error) {
    res.status(400).json(serializers.errorResponse(error.message, 'DOCUMENT_CREATION_FAILED'));
  }
}));

router.put('/documents/:id', validateRequest('document.update'), asyncHandler(async (req, res) => {
  try {
    const { title, classification, owner, description } = req.body;

    const doc = await DocumentService.updateDocument(
      req.params.id,
      { title, classification, owner, description },
      req.user.tenantId
    );

    res.json(serializers.successResponse({
      id: doc.id,
      title: doc.title,
      classification: doc.classification,
      updatedAt: doc.updatedAt
    }));
  } catch (error) {
    res.status(400).json(serializers.errorResponse(error.message, 'DOCUMENT_UPDATE_FAILED'));
  }
}));

router.delete('/documents/:id', asyncHandler(async (req, res) => {
  try {
    await DocumentService.deleteDocument(req.params.id, req.user.tenantId);
    res.json(serializers.successResponse({ success: true }));
  } catch (error) {
    res.status(400).json(serializers.errorResponse(error.message, 'DOCUMENT_DELETE_FAILED'));
  }
}));

// ===== ROLES API =====

router.get('/roles', asyncHandler(async (req, res) => {
  try {
    const { sortBy, sortOrder } = req.query;

    const roles = await RoleService.getAllRoles(req.user.tenantId);

    res.json(serializers.successResponse(roles.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      permissions: r.permissions,
      createdAt: r.createdAt
    }))));
  } catch (error) {
    res.status(500).json(serializers.errorResponse(error.message, 'DATABASE_ERROR'));
  }
}));

router.get('/roles/:name', asyncHandler(async (req, res) => {
  try {
    const role = await RoleService.getRoleByName(req.params.name, req.user.tenantId);
    res.json(serializers.successResponse({
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: role.permissions,
      createdAt: role.createdAt
    }));
  } catch (error) {
    res.status(404).json(serializers.errorResponse(error.message, 'ROLE_NOT_FOUND'));
  }
}));

router.post('/roles', validateRequest('role.create'), asyncHandler(async (req, res) => {
  try {
    const { name, description, permissions } = req.body;

    const role = await RoleService.createRole({
      name,
      description,
      permissions: permissions || [],
      tenantId: req.user.tenantId
    });

    res.status(201).json(serializers.successResponse({
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: role.permissions,
      createdAt: role.createdAt
    }));
  } catch (error) {
    res.status(400).json(serializers.errorResponse(error.message, 'ROLE_CREATION_FAILED'));
  }
}));

router.put('/roles/:id', validateRequest('role.update'), asyncHandler(async (req, res) => {
  try {
    const { description, permissions } = req.body;

    const role = await RoleService.updateRole(
      req.params.id,
      { description, permissions },
      req.user.tenantId
    );

    res.json(serializers.successResponse({
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: role.permissions,
      updatedAt: role.updatedAt
    }));
  } catch (error) {
    res.status(400).json(serializers.errorResponse(error.message, 'ROLE_UPDATE_FAILED'));
  }
}));

router.delete('/roles/:id', asyncHandler(async (req, res) => {
  try {
    await RoleService.deleteRole(req.params.id, req.user.tenantId);
    res.json(serializers.successResponse({ success: true }));
  } catch (error) {
    res.status(400).json(serializers.errorResponse(error.message, 'ROLE_DELETE_FAILED'));
  }
}));

// ===== POLICIES API =====

router.get('/policies', asyncHandler(async (req, res) => {
  try {
    const { type, status } = req.query;

    const policies = await PolicyService.getAllPolicies({
      type,
      status,
      tenantId: req.user.tenantId
    });

    res.json(serializers.successResponse(policies.map(p => ({
      id: p.id,
      name: p.name,
      type: p.type,
      target: p.target,
      status: p.status,
      createdAt: p.createdAt
    }))));
  } catch (error) {
    res.status(500).json(serializers.errorResponse(error.message, 'DATABASE_ERROR'));
  }
}));

router.get('/policies/:name', asyncHandler(async (req, res) => {
  try {
    const policy = await PolicyService.getPolicyByName(req.params.name, req.user.tenantId);
    res.json(serializers.successResponse({
      id: policy.id,
      name: policy.name,
      type: policy.type,
      target: policy.target,
      status: policy.status,
      createdAt: policy.createdAt
    }));
  } catch (error) {
    res.status(404).json(serializers.errorResponse(error.message, 'POLICY_NOT_FOUND'));
  }
}));

router.post('/policies', validateRequest('policy.create'), asyncHandler(async (req, res) => {
  try {
    const { name, type, target } = req.body;

    const policy = await PolicyService.createPolicy({
      name,
      type,
      target,
      tenantId: req.user.tenantId,
      status: 'active'
    });

    res.status(201).json(serializers.successResponse({
      id: policy.id,
      name: policy.name,
      type: policy.type,
      target: policy.target,
      status: policy.status,
      createdAt: policy.createdAt
    }));
  } catch (error) {
    res.status(400).json(serializers.errorResponse(error.message, 'POLICY_CREATION_FAILED'));
  }
}));

router.put('/policies/:id', validateRequest('policy.update'), asyncHandler(async (req, res) => {
  try {
    const { name, type, target, status } = req.body;

    const policy = await PolicyService.updatePolicy(
      req.params.id,
      { name, type, target, status },
      req.user.tenantId
    );

    res.json(serializers.successResponse({
      id: policy.id,
      name: policy.name,
      type: policy.type,
      target: policy.target,
      status: policy.status,
      updatedAt: policy.updatedAt
    }));
  } catch (error) {
    res.status(400).json(serializers.errorResponse(error.message, 'POLICY_UPDATE_FAILED'));
  }
}));

router.delete('/policies/:id', asyncHandler(async (req, res) => {
  try {
    await PolicyService.deletePolicy(req.params.id, req.user.tenantId);
    res.json(serializers.successResponse({ success: true }));
  } catch (error) {
    res.status(400).json(serializers.errorResponse(error.message, 'POLICY_DELETE_FAILED'));
  }
}));

router.post('/policies/:id/activate', asyncHandler(async (req, res) => {
  try {
    const policy = await PolicyService.activatePolicy(req.params.id, req.user.tenantId);
    res.json(serializers.successResponse({ status: policy.status }));
  } catch (error) {
    res.status(400).json(serializers.errorResponse(error.message, 'POLICY_ACTIVATION_FAILED'));
  }
}));

router.post('/policies/:id/deactivate', asyncHandler(async (req, res) => {
  try {
    const policy = await PolicyService.deactivatePolicy(req.params.id, req.user.tenantId);
    res.json(serializers.successResponse({ status: policy.status }));
  } catch (error) {
    res.status(400).json(serializers.errorResponse(error.message, 'POLICY_DEACTIVATION_FAILED'));
  }
}));

// ===== AUDIT LOGS API =====

router.get('/audit-logs', validatePagination, asyncHandler(async (req, res) => {
  try {
    const { page, pageSize, eventType, status, search, sortBy, sortOrder } = req.query;

    const result = await AuditLogService.getAllLogs({
      page: parseInt(page) || 1,
      pageSize: parseInt(pageSize) || 10,
      eventType,
      status,
      search,
      sortBy: sortBy || 'createdAt',
      sortOrder: sortOrder || 'desc',
      tenantId: req.user.tenantId
    });

    res.json({
      success: true,
      data: result.data.map(log => ({
        id: log.id,
        eventType: log.eventType,
        user: log.user,
        resource: log.resource,
        action: log.action,
        status: log.status,
        ipAddress: log.ipAddress,
        details: log.details,
        createdAt: log.createdAt
      })),
      pagination: result.pagination,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json(serializers.errorResponse(error.message, 'DATABASE_ERROR'));
  }
}));

// ===== AGENTS API =====

router.get('/agents', asyncHandler(async (req, res) => {
  try {
    const { status } = req.query;

    const agents = await AgentService.getAllAgents({
      status,
      tenantId: req.user.tenantId
    });

    res.json(serializers.successResponse(agents.map(a => ({
      id: a.id,
      name: a.name,
      type: a.type,
      status: a.status,
      lastSeen: a.lastSeen,
      createdAt: a.createdAt
    }))));
  } catch (error) {
    res.status(500).json(serializers.errorResponse(error.message, 'DATABASE_ERROR'));
  }
}));

router.get('/agents/:id', asyncHandler(async (req, res) => {
  try {
    const agent = await AgentService.getAgentById(req.params.id, req.user.tenantId);
    res.json(serializers.successResponse({
      id: agent.id,
      name: agent.name,
      type: agent.type,
      status: agent.status,
      lastSeen: agent.lastSeen,
      createdAt: agent.createdAt
    }));
  } catch (error) {
    res.status(404).json(serializers.errorResponse(error.message, 'AGENT_NOT_FOUND'));
  }
}));

router.post('/agents', validateRequest('agent.create'), asyncHandler(async (req, res) => {
  try {
    const { name, type } = req.body;

    const agent = await AgentService.createAgent({
      name,
      type,
      tenantId: req.user.tenantId,
      status: 'active'
    });

    res.status(201).json(serializers.successResponse({
      id: agent.id,
      name: agent.name,
      type: agent.type,
      apiKey: agent.apiKey,
      status: agent.status,
      createdAt: agent.createdAt
    }));
  } catch (error) {
    res.status(400).json(serializers.errorResponse(error.message, 'AGENT_CREATION_FAILED'));
  }
}));

router.put('/agents/:id', validateRequest('agent.update'), asyncHandler(async (req, res) => {
  try {
    const { name, type, status } = req.body;

    const agent = await AgentService.updateAgent(
      req.params.id,
      { name, type, status },
      req.user.tenantId
    );

    res.json(serializers.successResponse({
      id: agent.id,
      name: agent.name,
      type: agent.type,
      status: agent.status,
      updatedAt: agent.updatedAt
    }));
  } catch (error) {
    res.status(400).json(serializers.errorResponse(error.message, 'AGENT_UPDATE_FAILED'));
  }
}));

router.delete('/agents/:id', asyncHandler(async (req, res) => {
  try {
    await AgentService.deleteAgent(req.params.id, req.user.tenantId);
    res.json(serializers.successResponse({ success: true }));
  } catch (error) {
    res.status(400).json(serializers.errorResponse(error.message, 'AGENT_DELETE_FAILED'));
  }
}));

router.post('/agents/:id/regenerate-key', asyncHandler(async (req, res) => {
  try {
    const result = await AgentService.regenerateApiKey(req.params.id, req.user.tenantId);
    res.json(serializers.successResponse(result));
  } catch (error) {
    res.status(400).json(serializers.errorResponse(error.message, 'KEY_REGENERATION_FAILED'));
  }
}));

router.post('/agents/:id/activate', asyncHandler(async (req, res) => {
  try {
    const agent = await AgentService.activateAgent(req.params.id, req.user.tenantId);
    res.json(serializers.successResponse({ status: agent.status }));
  } catch (error) {
    res.status(400).json(serializers.errorResponse(error.message, 'AGENT_ACTIVATION_FAILED'));
  }
}));

router.post('/agents/:id/deactivate', asyncHandler(async (req, res) => {
  try {
    const agent = await AgentService.deactivateAgent(req.params.id, req.user.tenantId);
    res.json(serializers.successResponse({ status: agent.status }));
  } catch (error) {
    res.status(400).json(serializers.errorResponse(error.message, 'AGENT_DEACTIVATION_FAILED'));
  }
}));

// ===== DASHBOARD API =====

router.get('/dashboard/metrics', asyncHandler(async (req, res) => {
  try {
    const docsResult = await DocumentService.getAllDocuments({
      page: 1,
      pageSize: 1,
      tenantId: req.user.tenantId
    });
    const policiesResult = await PolicyService.getAllPolicies({
      tenantId: req.user.tenantId
    });
    const activeUsersCount = await UserService.countByRole('admin', req.user.tenantId) +
                            await UserService.countByRole('editor', req.user.tenantId) +
                            await UserService.countByRole('viewer', req.user.tenantId);
    const logsResult = await AuditLogService.getAllLogs({
      page: 1,
      pageSize: 1,
      tenantId: req.user.tenantId
    });

    res.json(serializers.successResponse({
      totalDocuments: docsResult.pagination.total,
      activeUsers: activeUsersCount,
      totalPolicies: policiesResult.length,
      auditEvents: logsResult.pagination.total
    }));
  } catch (error) {
    res.status(500).json(serializers.errorResponse(error.message, 'DATABASE_ERROR'));
  }
}));

router.get('/dashboard/recent-events', asyncHandler(async (req, res) => {
  try {
    const recentLogs = await AuditLogService.getRecentLogs(req.user.tenantId, 1, 5);

    res.json(serializers.successResponse(recentLogs.map(log => ({
      timestamp: log.createdAt,
      action: log.action,
      status: log.status,
      user: log.user
    }))));
  } catch (error) {
    res.status(500).json(serializers.errorResponse(error.message, 'DATABASE_ERROR'));
  }
}));

// ===== PREFERENCES API =====

router.get('/preferences', asyncHandler(async (req, res) => {
  try {
    const PreferencesService = require('../services/preferencesService');
    const preferences = await PreferencesService.getPreferences(req.user.email, req.user.tenantId);

    res.json(serializers.successResponse(preferences, 'User preferences retrieved successfully'));
  } catch (error) {
    res.status(500).json(serializers.errorResponse(error.message, 'DATABASE_ERROR'));
  }
}));

router.post('/preferences', asyncHandler(async (req, res) => {
  try {
    const PreferencesService = require('../services/preferencesService');
    const { theme, language, timezone, pageSize, enableNotifications, notifyOnPolicyChange, notifyOnDocumentAccess, notifyOnFailedLogin, notifyDigestFrequency } = req.body;

    const updates = {};
    if (theme) updates.theme = theme;
    if (language) updates.language = language;
    if (timezone) updates.timezone = timezone;
    if (pageSize) updates.pageSize = parseInt(pageSize);
    if (enableNotifications !== undefined) updates.enableNotifications = enableNotifications;
    if (notifyOnPolicyChange !== undefined) updates.notifyOnPolicyChange = notifyOnPolicyChange;
    if (notifyOnDocumentAccess !== undefined) updates.notifyOnDocumentAccess = notifyOnDocumentAccess;
    if (notifyOnFailedLogin !== undefined) updates.notifyOnFailedLogin = notifyOnFailedLogin;
    if (notifyDigestFrequency) updates.notifyDigestFrequency = notifyDigestFrequency;

    const preferences = await PreferencesService.updatePreferences(req.user.email, req.user.tenantId, updates);

    res.json(serializers.successResponse(preferences, 'User preferences updated successfully'));
  } catch (error) {
    res.status(400).json(serializers.errorResponse(error.message, 'VALIDATION_ERROR'));
  }
}));

router.post('/preferences/reset', asyncHandler(async (req, res) => {
  try {
    const PreferencesService = require('../services/preferencesService');
    const preferences = await PreferencesService.resetToDefaults(req.user.email, req.user.tenantId);

    res.json(serializers.successResponse(preferences, 'User preferences reset to defaults'));
  } catch (error) {
    res.status(500).json(serializers.errorResponse(error.message, 'DATABASE_ERROR'));
  }
}));

// ===== CHAT API =====

router.get('/chat/messages', validatePagination, asyncHandler(async (req, res) => {
  try {
    const { page = 0, size = 50 } = req.query;

    const result = await ChatService.getHistory({
      userId: req.user.id,
      tenantId: req.user.tenantId,
      page: parseInt(page),
      size: parseInt(size)
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json(serializers.errorResponse(error.message, 'DATABASE_ERROR'));
  }
}));

router.post('/chat/messages', asyncHandler(async (req, res) => {
  try {
    const { content } = req.body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json(
        serializers.errorResponse('Message content is required', 'VALIDATION_ERROR')
      );
    }

    const result = await ChatService.sendMessage({
      content: content.trim(),
      userId: req.user.id,
      tenantId: req.user.tenantId
    });

    res.json({
      success: true,
      userMessage: result.userMessage,
      assistantMessage: result.assistantMessage
    });
  } catch (error) {
    res.status(500).json(serializers.errorResponse(error.message, 'DATABASE_ERROR'));
  }
}));

// ===== ERROR HANDLING =====

router.use((req, res) => {
  res.status(404).json(serializers.errorResponse('API endpoint not found', 'NOT_FOUND'));
});

// Global error handler for async errors
router.use((err, req, res, next) => {
  console.error('API Error:', err);
  res.status(err.status || 500).json(
    serializers.errorResponse(err.message || 'Internal Server Error', 'SERVER_ERROR')
  );
});

module.exports = router;
