const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { validateRequest, validatePagination } = require('../middleware/validation');
const mockData = require('../models/mockData');
const { applyFilters } = require('../utils/pagination');
const serializers = require('../schemas/serializers');

// Apply auth middleware to all API routes
router.use(requireAuth);
router.use(requireAdmin);

// ===== USERS API =====

router.get('/users', validatePagination, (req, res) => {
  const { page, pageSize, search, status, role, sortBy, sortOrder } = req.query;

  const result = applyFilters(mockData.mockUsers, {
    filters: { status, role },
    query: search,
    searchFields: ['email', 'role'],
    sortBy: sortBy || 'email',
    sortOrder: sortOrder || 'asc',
    page: page || 1,
    pageSize: pageSize || 10
  });

  res.json({
    success: true,
    data: result.data.map(serializers.user),
    pagination: result.pagination,
    timestamp: new Date().toISOString()
  });
});

router.get('/users/:id', (req, res) => {
  const user = mockData.mockUsers.find(u => u.id === req.params.id);
  if (!user) {
    return res.status(404).json(serializers.errorResponse('User not found', 'USER_NOT_FOUND'));
  }
  res.json(serializers.successResponse(user, serializers.user));
});

router.post('/users', validateRequest('user.create'), (req, res) => {
  const { email, role } = req.body;

  const newUser = {
    id: `user-${Date.now()}`,
    email,
    role,
    tenantId: 'tenant-001',
    lastLogin: null,
    status: 'active',
    createdAt: new Date()
  };

  mockData.mockUsers.push(newUser);
  res.status(201).json(serializers.successResponse(newUser, serializers.user));
});

router.put('/users/:id', validateRequest('user.update'), (req, res) => {
  const user = mockData.mockUsers.find(u => u.id === req.params.id);
  if (!user) {
    return res.status(404).json(serializers.errorResponse('User not found', 'USER_NOT_FOUND'));
  }

  const { email, role, status } = req.body;
  if (email) user.email = email;
  if (role) user.role = role;
  if (status) user.status = status;

  res.json(serializers.successResponse(user, serializers.user));
});

router.delete('/users/:id', (req, res) => {
  const index = mockData.mockUsers.findIndex(u => u.id === req.params.id);
  if (index === -1) {
    return res.status(404).json(serializers.errorResponse('User not found', 'USER_NOT_FOUND'));
  }

  const deleted = mockData.mockUsers.splice(index, 1);
  res.json(serializers.successResponse(deleted[0], serializers.user));
});

// ===== DOCUMENTS API =====

router.get('/documents', validatePagination, (req, res) => {
  const { page, pageSize, search, classification, sortBy, sortOrder } = req.query;

  const result = applyFilters(mockData.mockDocuments, {
    filters: { classification },
    query: search,
    searchFields: ['title', 'owner'],
    sortBy: sortBy || 'uploadedAt',
    sortOrder: sortOrder || 'desc',
    page: page || 1,
    pageSize: pageSize || 10
  });

  res.json({
    success: true,
    data: result.data.map(serializers.document),
    pagination: result.pagination,
    timestamp: new Date().toISOString()
  });
});

router.get('/documents/:id', (req, res) => {
  const doc = mockData.mockDocuments.find(d => d.id === req.params.id);
  if (!doc) {
    return res.status(404).json(serializers.errorResponse('Document not found', 'DOCUMENT_NOT_FOUND'));
  }
  res.json(serializers.successResponse(doc, serializers.document));
});

router.post('/documents', validateRequest('document.create'), (req, res) => {
  const { title, classification, owner } = req.body;

  const newDoc = {
    id: `doc-${Date.now()}`,
    title,
    classification,
    owner,
    uploadedAt: new Date(),
    accessCount: 0,
    size: Math.floor(Math.random() * 10000000)
  };

  mockData.mockDocuments.push(newDoc);
  res.status(201).json(serializers.successResponse(newDoc, serializers.document));
});

router.put('/documents/:id', validateRequest('document.update'), (req, res) => {
  const doc = mockData.mockDocuments.find(d => d.id === req.params.id);
  if (!doc) {
    return res.status(404).json(serializers.errorResponse('Document not found', 'DOCUMENT_NOT_FOUND'));
  }

  const { title, classification, owner } = req.body;
  if (title) doc.title = title;
  if (classification) doc.classification = classification;
  if (owner) doc.owner = owner;

  res.json(serializers.successResponse(doc, serializers.document));
});

router.delete('/documents/:id', (req, res) => {
  const index = mockData.mockDocuments.findIndex(d => d.id === req.params.id);
  if (index === -1) {
    return res.status(404).json(serializers.errorResponse('Document not found', 'DOCUMENT_NOT_FOUND'));
  }

  const deleted = mockData.mockDocuments.splice(index, 1);
  res.json(serializers.successResponse(deleted[0], serializers.document));
});

// ===== ROLES API =====

router.get('/roles', (req, res) => {
  const { sortBy, sortOrder } = req.query;

  const result = applyFilters(mockData.mockRoles, {
    sortBy: sortBy || 'name',
    sortOrder: sortOrder || 'asc',
    page: 1,
    pageSize: 100
  });

  res.json(serializers.successResponse(result.data.map(serializers.role)));
});

router.get('/roles/:name', (req, res) => {
  const role = mockData.mockRoles.find(r => r.name === req.params.name);
  if (!role) {
    return res.status(404).json(serializers.errorResponse('Role not found', 'ROLE_NOT_FOUND'));
  }
  res.json(serializers.successResponse(role, serializers.role));
});

router.post('/roles', validateRequest('role.create'), (req, res) => {
  const { name, description, permissions } = req.body;

  const newRole = {
    name,
    description,
    permissions,
    userCount: 0
  };

  mockData.mockRoles.push(newRole);
  res.status(201).json(serializers.successResponse(newRole, serializers.role));
});

// ===== ABAC RULES API =====

router.get('/abac-rules', (req, res) => {
  const { status, sortBy, sortOrder } = req.query;

  const result = applyFilters(mockData.mockABACRules, {
    filters: { status },
    sortBy: sortBy || 'name',
    sortOrder: sortOrder || 'asc',
    page: 1,
    pageSize: 100
  });

  res.json(serializers.successResponse(result.data.map(serializers.abacRule)));
});

router.get('/abac-rules/:name', (req, res) => {
  const rule = mockData.mockABACRules.find(r => r.name === req.params.name);
  if (!rule) {
    return res.status(404).json(serializers.errorResponse('ABAC rule not found', 'RULE_NOT_FOUND'));
  }
  res.json(serializers.successResponse(rule, serializers.abacRule));
});

router.post('/abac-rules', validateRequest('abacRule.create'), (req, res) => {
  const { name, condition, effect, resources } = req.body;

  const newRule = {
    name,
    condition,
    effect,
    resources,
    status: 'active'
  };

  mockData.mockABACRules.push(newRule);
  res.status(201).json(serializers.successResponse(newRule, serializers.abacRule));
});

// ===== POLICIES API =====

router.get('/policies', (req, res) => {
  const { status, type, sortBy, sortOrder } = req.query;

  const result = applyFilters(mockData.mockPolicies, {
    filters: { status, type },
    sortBy: sortBy || 'createdAt',
    sortOrder: sortOrder || 'desc',
    page: 1,
    pageSize: 100
  });

  res.json(serializers.successResponse(result.data.map(serializers.policy)));
});

router.get('/policies/:name', (req, res) => {
  const policy = mockData.mockPolicies.find(p => p.name === req.params.name);
  if (!policy) {
    return res.status(404).json(serializers.errorResponse('Policy not found', 'POLICY_NOT_FOUND'));
  }
  res.json(serializers.successResponse(policy, serializers.policy));
});

router.post('/policies', validateRequest('policy.create'), (req, res) => {
  const { name, type, target } = req.body;

  const newPolicy = {
    name,
    type,
    target,
    status: 'active',
    createdAt: new Date()
  };

  mockData.mockPolicies.push(newPolicy);
  res.status(201).json(serializers.successResponse(newPolicy, serializers.policy));
});

// ===== AUDIT LOGS API =====

router.get('/audit-logs', validatePagination, (req, res) => {
  const { page, pageSize, eventType, status, search, sortBy, sortOrder } = req.query;

  const result = applyFilters(mockData.mockAuditLogs, {
    filters: { eventType, status },
    query: search,
    searchFields: ['user', 'action', 'resource'],
    sortBy: sortBy || 'timestamp',
    sortOrder: sortOrder || 'desc',
    page: page || 1,
    pageSize: pageSize || 10
  });

  res.json({
    success: true,
    data: result.data.map(serializers.auditLog),
    pagination: result.pagination,
    timestamp: new Date().toISOString()
  });
});

// ===== AGENTS API =====

router.get('/agents', (req, res) => {
  const { status, sortBy, sortOrder } = req.query;

  const result = applyFilters(mockData.mockAgents, {
    filters: { status },
    sortBy: sortBy || 'name',
    sortOrder: sortOrder || 'asc',
    page: 1,
    pageSize: 100
  });

  res.json(serializers.successResponse(result.data.map(serializers.agent)));
});

router.get('/agents/:id', (req, res) => {
  const agent = mockData.mockAgents.find(a => a.name === req.params.id);
  if (!agent) {
    return res.status(404).json(serializers.errorResponse('Agent not found', 'AGENT_NOT_FOUND'));
  }
  res.json(serializers.successResponse(agent, serializers.agent));
});

router.post('/agents', validateRequest('agent.create'), (req, res) => {
  const { name, type } = req.body;

  const newAgent = {
    name,
    type,
    status: 'active',
    apiKey: `sk-agent-${Date.now()}`,
    lastSeen: new Date(),
    requests24h: 0
  };

  mockData.mockAgents.push(newAgent);
  res.status(201).json(serializers.successResponse(newAgent, serializers.agent));
});

// ===== AGENT GROUPS API =====

router.get('/agent-groups', (req, res) => {
  res.json(serializers.successResponse(mockData.mockAgentGroups.map(serializers.agentGroup)));
});

// ===== MODELS API =====

router.get('/models', (req, res) => {
  const { status, sortBy, sortOrder } = req.query;

  const result = applyFilters(mockData.mockModels, {
    filters: { status },
    sortBy: sortBy || 'name',
    sortOrder: sortOrder || 'asc',
    page: 1,
    pageSize: 100
  });

  res.json(serializers.successResponse(result.data.map(serializers.model)));
});

// ===== DASHBOARD API =====

router.get('/dashboard/metrics', (req, res) => {
  res.json(serializers.successResponse({
    totalDocuments: mockData.mockDocuments.length,
    activeUsers: mockData.mockUsers.filter(u => u.status === 'active').length,
    totalPolicies: mockData.mockPolicies.length,
    auditEvents: mockData.mockAuditLogs.length
  }));
});

router.get('/dashboard/recent-events', (req, res) => {
  const recentEvents = mockData.mockAuditLogs.slice(0, 5).map(log => ({
    timestamp: log.timestamp,
    action: log.action,
    status: log.status
  }));

  res.json(serializers.successResponse(recentEvents));
});

// ===== ERROR HANDLING =====

router.use((req, res) => {
  res.status(404).json(serializers.errorResponse('API endpoint not found', 'NOT_FOUND'));
});

module.exports = router;
