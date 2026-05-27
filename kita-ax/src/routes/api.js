const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const mockData = require('../models/mockData');
const { applyFilters } = require('../utils/pagination');

// Apply auth middleware to all API routes
router.use(requireAuth);
router.use(requireAdmin);

// ===== USERS API =====

router.get('/users', (req, res) => {
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
    data: result.data,
    pagination: result.pagination
  });
});

router.get('/users/:id', (req, res) => {
  const user = mockData.mockUsers.find(u => u.id === req.params.id);
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }
  res.json({ success: true, data: user });
});

router.post('/users', (req, res) => {
  const { email, role } = req.body;
  if (!email || !role) {
    return res.status(400).json({ success: false, error: 'Email and role required' });
  }

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
  res.status(201).json({ success: true, data: newUser });
});

router.put('/users/:id', (req, res) => {
  const user = mockData.mockUsers.find(u => u.id === req.params.id);
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  const { email, role, status } = req.body;
  if (email) user.email = email;
  if (role) user.role = role;
  if (status) user.status = status;

  res.json({ success: true, data: user });
});

router.delete('/users/:id', (req, res) => {
  const index = mockData.mockUsers.findIndex(u => u.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  const deleted = mockData.mockUsers.splice(index, 1);
  res.json({ success: true, data: deleted[0], message: 'User deleted' });
});

// ===== DOCUMENTS API =====

router.get('/documents', (req, res) => {
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
    data: result.data,
    pagination: result.pagination
  });
});

router.get('/documents/:id', (req, res) => {
  const doc = mockData.mockDocuments.find(d => d.id === req.params.id);
  if (!doc) {
    return res.status(404).json({ success: false, error: 'Document not found' });
  }
  res.json({ success: true, data: doc });
});

router.post('/documents', (req, res) => {
  const { title, classification, owner } = req.body;
  if (!title || !classification || !owner) {
    return res.status(400).json({ success: false, error: 'Title, classification, and owner required' });
  }

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
  res.status(201).json({ success: true, data: newDoc });
});

router.put('/documents/:id', (req, res) => {
  const doc = mockData.mockDocuments.find(d => d.id === req.params.id);
  if (!doc) {
    return res.status(404).json({ success: false, error: 'Document not found' });
  }

  const { title, classification, owner } = req.body;
  if (title) doc.title = title;
  if (classification) doc.classification = classification;
  if (owner) doc.owner = owner;

  res.json({ success: true, data: doc });
});

router.delete('/documents/:id', (req, res) => {
  const index = mockData.mockDocuments.findIndex(d => d.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, error: 'Document not found' });
  }

  const deleted = mockData.mockDocuments.splice(index, 1);
  res.json({ success: true, data: deleted[0], message: 'Document deleted' });
});

// ===== ROLES & RBAC API =====

router.get('/roles', (req, res) => {
  const { sortBy, sortOrder } = req.query;

  const result = applyFilters(mockData.mockRoles, {
    sortBy: sortBy || 'name',
    sortOrder: sortOrder || 'asc',
    page: 1,
    pageSize: 100
  });

  res.json({
    success: true,
    data: result.data
  });
});

router.get('/roles/:name', (req, res) => {
  const role = mockData.mockRoles.find(r => r.name === req.params.name);
  if (!role) {
    return res.status(404).json({ success: false, error: 'Role not found' });
  }
  res.json({ success: true, data: role });
});

router.post('/roles', (req, res) => {
  const { name, description, permissions } = req.body;
  if (!name || !description || !permissions) {
    return res.status(400).json({ success: false, error: 'Name, description, and permissions required' });
  }

  const newRole = {
    name,
    description,
    permissions,
    userCount: 0
  };

  mockData.mockRoles.push(newRole);
  res.status(201).json({ success: true, data: newRole });
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

  res.json({
    success: true,
    data: result.data
  });
});

router.get('/abac-rules/:name', (req, res) => {
  const rule = mockData.mockABACRules.find(r => r.name === req.params.name);
  if (!rule) {
    return res.status(404).json({ success: false, error: 'ABAC rule not found' });
  }
  res.json({ success: true, data: rule });
});

router.post('/abac-rules', (req, res) => {
  const { name, condition, effect, resources } = req.body;
  if (!name || !condition || !effect || !resources) {
    return res.status(400).json({ success: false, error: 'All fields required' });
  }

  const newRule = {
    name,
    condition,
    effect,
    resources,
    status: 'active'
  };

  mockData.mockABACRules.push(newRule);
  res.status(201).json({ success: true, data: newRule });
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

  res.json({
    success: true,
    data: result.data
  });
});

router.get('/policies/:name', (req, res) => {
  const policy = mockData.mockPolicies.find(p => p.name === req.params.name);
  if (!policy) {
    return res.status(404).json({ success: false, error: 'Policy not found' });
  }
  res.json({ success: true, data: policy });
});

router.post('/policies', (req, res) => {
  const { name, type, target } = req.body;
  if (!name || !type || !target) {
    return res.status(400).json({ success: false, error: 'Name, type, and target required' });
  }

  const newPolicy = {
    name,
    type,
    target,
    status: 'active',
    createdAt: new Date()
  };

  mockData.mockPolicies.push(newPolicy);
  res.status(201).json({ success: true, data: newPolicy });
});

// ===== AUDIT LOGS API =====

router.get('/audit-logs', (req, res) => {
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
    data: result.data,
    pagination: result.pagination
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

  res.json({
    success: true,
    data: result.data
  });
});

router.get('/agents/:id', (req, res) => {
  const agent = mockData.mockAgents.find(a => a.name === req.params.id);
  if (!agent) {
    return res.status(404).json({ success: false, error: 'Agent not found' });
  }
  res.json({ success: true, data: agent });
});

router.post('/agents', (req, res) => {
  const { name, type } = req.body;
  if (!name || !type) {
    return res.status(400).json({ success: false, error: 'Name and type required' });
  }

  const newAgent = {
    name,
    type,
    status: 'active',
    apiKey: `sk-agent-${Date.now()}`,
    lastSeen: new Date(),
    requests24h: 0
  };

  mockData.mockAgents.push(newAgent);
  res.status(201).json({ success: true, data: newAgent });
});

// ===== AGENT GROUPS API =====

router.get('/agent-groups', (req, res) => {
  res.json({
    success: true,
    data: mockData.mockAgentGroups
  });
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

  res.json({
    success: true,
    data: result.data
  });
});

// ===== DASHBOARD METRICS API =====

router.get('/dashboard/metrics', (req, res) => {
  res.json({
    success: true,
    data: {
      totalDocuments: mockData.mockDocuments.length,
      activeUsers: mockData.mockUsers.filter(u => u.status === 'active').length,
      totalPolicies: mockData.mockPolicies.length,
      auditEvents: mockData.mockAuditLogs.length
    }
  });
});

router.get('/dashboard/recent-events', (req, res) => {
  const recentEvents = mockData.mockAuditLogs.slice(0, 5).map(log => ({
    timestamp: log.timestamp,
    action: log.action,
    status: log.status
  }));

  res.json({
    success: true,
    data: recentEvents
  });
});

// ===== ERROR HANDLING =====

router.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'API endpoint not found',
    path: req.path
  });
});

module.exports = router;
