/**
 * Admin Routes for KYRA Admin Console
 * All routes require authentication
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

// All admin routes require authentication
router.use(requireAuth);

// ===== DASHBOARD =====
router.get('/dashboard', (req, res) => {
  // Mock data
  const metrics = {
    totalDocuments: 1247,
    activeUsers: 12,
    totalPolicies: 8,
    auditEvents: 342,
    docsThisMonth: 142,
    recentEvents: [
      {
        timestamp: new Date().toISOString(),
        user: { email: req.user.email },
        action: 'LOGIN',
        resource: '/admin/dashboard',
        status: 'success'
      }
    ]
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
  // Mock data
  const users = [
    {
      id: '1',
      email: 'admin@seekerslab.com',
      name: 'Admin User',
      role: 'admin',
      status: 'active',
      lastLogin: new Date().toISOString()
    },
    {
      id: '2',
      email: 'manager@seekerslab.com',
      name: 'Manager User',
      role: 'manager',
      status: 'active',
      lastLogin: new Date(Date.now() - 3600000).toISOString()
    }
  ];

  res.render('admin/users', {
    title: 'Users - KYRA Admin Console',
    current_page: 'users',
    users,
    user: req.user,
    csrfToken: req.csrfToken?.() || ''
  });
});

// ===== DOCUMENTS =====
router.get('/documents', (req, res) => {
  const docs = [
    {
      id: '1',
      title: 'Security Policy',
      classification: 'confidential',
      owner: 'admin@seekerslab.com',
      createdAt: new Date().toISOString()
    }
  ];

  res.render('admin/documents', {
    title: 'Documents - KYRA Admin Console',
    current_page: 'documents',
    documents: docs,
    user: req.user,
    csrfToken: req.csrfToken?.() || ''
  });
});

// ===== ACCESS POLICIES =====
router.get('/access-policies', (req, res) => {
  const roles = [
    { id: 'admin', name: '👨‍💼 Admin' },
    { id: 'manager', name: '👔 Manager' },
    { id: 'user', name: '👤 User' },
    { id: 'viewer', name: '👁️ Viewer' }
  ];

  const classifications = [
    { id: 'public', name: 'Public' },
    { id: 'internal', name: 'Internal' },
    { id: 'confidential', name: 'Confidential' },
    { id: 'restricted', name: 'Restricted' }
  ];

  // Mock policy matrix
  const policies = {
    admin: { public: true, internal: true, confidential: true, restricted: true },
    manager: { public: true, internal: true, confidential: true, restricted: false },
    user: { public: true, internal: true, confidential: false, restricted: false },
    viewer: { public: true, internal: false, confidential: false, restricted: false }
  };

  res.render('admin/access-policies', {
    title: 'Access Policies - KYRA Admin Console',
    current_page: 'policies',
    roles,
    classifications,
    policies,
    user: req.user,
    csrfToken: req.csrfToken?.() || ''
  });
});

// ===== AUDIT LOGS =====
router.get('/audit-logs', (req, res) => {
  const logs = [
    {
      timestamp: new Date().toISOString(),
      user: { email: req.user.email },
      action: 'read',
      resource: '/admin/dashboard',
      details: 'Dashboard accessed',
      status: 'success'
    }
  ];

  res.render('admin/audit-logs', {
    title: 'Audit Logs - KYRA Admin Console',
    current_page: 'audit',
    logs,
    users: [{ id: '1', email: req.user.email }],
    user: req.user,
    csrfToken: req.csrfToken?.() || ''
  });
});

// ===== SETTINGS =====
router.get('/settings', (req, res) => {
  const settings = {
    siteTitle: 'KYRA Admin Console',
    sessionTimeout: 3600,
    enableTwoFactor: true,
    auditLogRetention: 90
  };

  res.render('admin/settings', {
    title: 'Settings - KYRA Admin Console',
    current_page: 'settings',
    settings,
    user: req.user,
    csrfToken: req.csrfToken?.() || ''
  });
});

// ===== AGENTS =====
router.get('/agents', (req, res) => {
  const agents = [
    {
      id: '1',
      name: 'Main Agent',
      status: 'active',
      lastSeen: new Date().toISOString()
    }
  ];

  res.render('admin/agents', {
    title: 'Agents - KYRA Admin Console',
    current_page: 'agents',
    agents,
    user: req.user,
    csrfToken: req.csrfToken?.() || ''
  });
});

module.exports = router;
