const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const mockData = require('../models/mockData');

// All admin routes require authentication
router.use(requireAuth);

// ===== DASHBOARD =====
router.get('/dashboard', (req, res) => {
  const metrics = {
    totalDocuments: mockData.mockDocuments.length,
    activeUsers: mockData.mockUsers.filter(u => u.status === 'active').length,
    totalPolicies: mockData.mockPolicies.length,
    auditEvents: mockData.mockAuditLogs.length,
    recentEvents: mockData.mockAuditLogs.slice(0, 5).map(log => ({
      timestamp: log.timestamp,
      action: log.action,
      status: log.status
    }))
  };

  res.render('admin/dashboard', {
    title: 'Dashboard - KYRA Admin Console',
    current_page: 'dashboard',
    metrics,
    user: req.user,
    csrfToken: req.csrfToken?.() || ''
  });
});

// ===== USERS =====
router.get('/users', (req, res) => {
  res.render('admin/users', {
    title: 'Users - KYRA Admin Console',
    current_page: 'users',
    users: mockData.mockUsers,
    user: req.user,
    csrfToken: req.csrfToken?.() || ''
  });
});

// ===== DOCUMENTS =====
router.get('/documents', (req, res) => {
  res.render('admin/documents', {
    title: 'Documents - KYRA Admin Console',
    current_page: 'documents',
    documents: mockData.mockDocuments,
    user: req.user,
    csrfToken: req.csrfToken?.() || ''
  });
});

// ===== ACCESS POLICIES =====
router.get('/access-policies', (req, res) => {
  res.render('admin/access-policies', {
    title: 'Access Policies - KYRA Admin Console',
    current_page: 'policies',
    rbacRoles: mockData.mockRoles,
    abacRules: mockData.mockABACRules,
    policies: mockData.mockPolicies,
    user: req.user,
    csrfToken: req.csrfToken?.() || ''
  });
});

// ===== AUDIT LOGS =====
router.get('/audit-logs', (req, res) => {
  res.render('admin/audit-logs', {
    title: 'Audit Logs - KYRA Admin Console',
    current_page: 'audit',
    auditLogs: mockData.mockAuditLogs,
    user: req.user,
    csrfToken: req.csrfToken?.() || ''
  });
});

// ===== SETTINGS =====
router.get('/settings', (req, res) => {
  res.render('admin/settings', {
    title: 'Settings - KYRA Admin Console',
    current_page: 'settings',
    user: req.user,
    csrfToken: req.csrfToken?.() || ''
  });
});

// ===== AGENTS =====
router.get('/agents', (req, res) => {
  res.render('admin/agents', {
    title: 'Agents - KYRA Admin Console',
    current_page: 'agents',
    agents: mockData.mockAgents,
    agentGroups: mockData.mockAgentGroups,
    models: mockData.mockModels,
    user: req.user,
    csrfToken: req.csrfToken?.() || ''
  });
});

module.exports = router;
