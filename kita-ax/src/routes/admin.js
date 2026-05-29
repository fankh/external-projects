const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

// Database Services
const UserService = require('../services/userService');
const DocumentService = require('../services/documentService');
const RoleService = require('../services/roleService');
const PolicyService = require('../services/policyService');
const AuditLogService = require('../services/auditLogService');
const AgentService = require('../services/agentService');

// All admin routes require authentication and admin role
router.use(requireAuth);
router.use(requireAdmin);

// Async error handler wrapper
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Flash message helper using query params
function flash(res, redirectTo, type, message) {
  const sep = redirectTo.includes('?') ? '&' : '?';
  res.redirect(`${redirectTo}${sep}${type}=${encodeURIComponent(message)}`);
}

// Helper to parse pagination from query
function getPaginationParams(req) {
  return {
    page: parseInt(req.query.page) || 1,
    pageSize: parseInt(req.query.pageSize) || 10,
    search: req.query.search || undefined,
    status: req.query.status || undefined,
    role: req.query.role || undefined,
    classification: req.query.classification || undefined,
    eventType: req.query.eventType || undefined,
    sortBy: req.query.sortBy || undefined,
    sortOrder: req.query.sortOrder || 'desc'
  };
}

// ===== DASHBOARD =====

router.get('/dashboard', asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;

  const [userResult, docResult, policies, recentLogs] = await Promise.all([
    UserService.getAllUsers({ page: 1, pageSize: 1, status: 'active', tenantId }),
    DocumentService.getAllDocuments({ page: 1, pageSize: 1, tenantId }),
    PolicyService.getAllPolicies({ tenantId }),
    AuditLogService.getRecentLogs(tenantId, 7, 5)
  ]);

  const metrics = {
    totalDocuments: docResult.pagination.total,
    activeUsers: userResult.pagination.total,
    totalPolicies: policies.length,
    auditEvents: recentLogs.length,
    recentEvents: recentLogs.map(log => ({
      timestamp: log.createdAt,
      action: log.action,
      status: log.status
    }))
  };

  const flashSuccess = req.query.success || null;
  const flashError = req.query.error || null;

  res.render('admin/dashboard', {
    title: 'Dashboard - KYRA Admin Console',
    current_page: 'dashboard',
    metrics,
    flashSuccess,
    flashError,
    user: req.user,
    csrfToken: req.csrfToken?.() || ''
  });
}));

// ===== USERS =====

router.get('/users', asyncHandler(async (req, res) => {
  const { page, pageSize, search, status, role } = getPaginationParams(req);
  const tenantId = req.user.tenantId;

  const result = await UserService.getAllUsers({
    page,
    pageSize,
    search,
    status,
    role,
    sortBy: 'email',
    sortOrder: 'asc',
    tenantId
  });

  const searchParams = new URLSearchParams({ search, status, role }).toString();
  const flashSuccess = req.query.success || null;
  const flashError = req.query.error || null;

  res.render('admin/users', {
    title: 'Users - KYRA Admin Console',
    current_page: 'users',
    users: result.data,
    pagination: result.pagination,
    searchParams,
    flashSuccess,
    flashError,
    user: req.user,
    csrfToken: req.csrfToken?.() || ''
  });
}));

router.get('/users/new', (req, res) => {
  const flashError = req.query.error || null;

  res.render('admin/users-new', {
    title: 'Create User - KYRA Admin Console',
    current_page: 'users',
    flashError,
    user: req.user,
    csrfToken: req.csrfToken?.() || ''
  });
});

router.post('/users', asyncHandler(async (req, res) => {
  try {
    const { email, password, role, status } = req.body;

    if (!email || !password || !role) {
      return flash(res, '/admin/users/new', 'error', 'Email, password, and role are required');
    }

    await UserService.createUser({
      email,
      password,
      role,
      tenantId: req.user.tenantId,
      status: status || 'active'
    });

    await AuditLogService.createLog({
      eventType: 'user-management',
      user: req.user.email,
      resource: email,
      action: 'Create user',
      status: 'success',
      ipAddress: req.ip,
      details: { email, role },
      tenantId: req.user.tenantId
    });

    flash(res, '/admin/users', 'success', `User ${email} created successfully`);
  } catch (err) {
    await AuditLogService.createLog({
      eventType: 'user-management',
      user: req.user.email,
      resource: req.body.email,
      action: 'Create user',
      status: 'failure',
      ipAddress: req.ip,
      details: { error: err.message },
      tenantId: req.user.tenantId
    });

    flash(res, '/admin/users/new', 'error', err.message);
  }
}));

router.get('/users/:id/edit', asyncHandler(async (req, res) => {
  const editUser = await UserService.getUserById(req.params.id, req.user.tenantId);
  const flashError = req.query.error || null;

  res.render('admin/users-edit', {
    title: 'Edit User - KYRA Admin Console',
    current_page: 'users',
    editUser,
    flashError,
    user: req.user,
    csrfToken: req.csrfToken?.() || ''
  });
}));

router.post('/users/:id', asyncHandler(async (req, res) => {
  try {
    const { email, role, status } = req.body;

    await UserService.updateUser(
      req.params.id,
      { email, role, status },
      req.user.tenantId
    );

    await AuditLogService.createLog({
      eventType: 'user-management',
      user: req.user.email,
      resource: req.params.id,
      action: 'Update user',
      status: 'success',
      ipAddress: req.ip,
      tenantId: req.user.tenantId
    });

    flash(res, '/admin/users', 'success', 'User updated successfully');
  } catch (err) {
    flash(res, `/admin/users/${req.params.id}/edit`, 'error', err.message);
  }
}));

router.post('/users/:id/delete', asyncHandler(async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return flash(res, '/admin/users', 'error', 'Cannot delete your own account');
    }

    await UserService.deleteUser(req.params.id, req.user.tenantId);

    await AuditLogService.createLog({
      eventType: 'user-management',
      user: req.user.email,
      resource: req.params.id,
      action: 'Delete user',
      status: 'success',
      ipAddress: req.ip,
      tenantId: req.user.tenantId
    });

    flash(res, '/admin/users', 'success', 'User deleted successfully');
  } catch (err) {
    flash(res, '/admin/users', 'error', err.message);
  }
}));

// ===== DOCUMENTS =====

router.get('/documents', asyncHandler(async (req, res) => {
  const { page, pageSize, search, classification } = getPaginationParams(req);
  const tenantId = req.user.tenantId;

  const result = await DocumentService.getAllDocuments({
    page,
    pageSize,
    search,
    classification,
    sortBy: 'createdAt',
    sortOrder: 'desc',
    tenantId
  });

  const searchParams = new URLSearchParams({ search, classification }).toString();
  const flashSuccess = req.query.success || null;
  const flashError = req.query.error || null;

  res.render('admin/documents', {
    title: 'Documents - KYRA Admin Console',
    current_page: 'documents',
    documents: result.data,
    pagination: result.pagination,
    searchParams,
    flashSuccess,
    flashError,
    user: req.user,
    csrfToken: req.csrfToken?.() || ''
  });
}));

router.get('/documents/new', (req, res) => {
  const flashError = req.query.error || null;

  res.render('admin/documents-new', {
    title: 'Create Document - KYRA Admin Console',
    current_page: 'documents',
    flashError,
    user: req.user,
    csrfToken: req.csrfToken?.() || ''
  });
});

router.post('/documents', asyncHandler(async (req, res) => {
  try {
    const { title, classification, owner, description } = req.body;

    if (!title || !classification || !owner) {
      return flash(res, '/admin/documents/new', 'error', 'Title, classification, and owner are required');
    }

    await DocumentService.createDocument({
      title,
      classification,
      owner,
      description: description || '',
      tenantId: req.user.tenantId
    });

    await AuditLogService.createLog({
      eventType: 'document-access',
      user: req.user.email,
      resource: title,
      action: 'Create document',
      status: 'success',
      ipAddress: req.ip,
      details: { title, classification },
      tenantId: req.user.tenantId
    });

    flash(res, '/admin/documents', 'success', `Document "${title}" created successfully`);
  } catch (err) {
    flash(res, '/admin/documents/new', 'error', err.message);
  }
}));

router.get('/documents/:id/edit', asyncHandler(async (req, res) => {
  const editDoc = await DocumentService.getDocumentById(req.params.id, req.user.tenantId);
  const flashError = req.query.error || null;

  res.render('admin/documents-edit', {
    title: 'Edit Document - KYRA Admin Console',
    current_page: 'documents',
    editDoc,
    flashError,
    user: req.user,
    csrfToken: req.csrfToken?.() || ''
  });
}));

router.post('/documents/:id', asyncHandler(async (req, res) => {
  try {
    const { title, classification, owner, description } = req.body;

    await DocumentService.updateDocument(
      req.params.id,
      { title, classification, owner, description },
      req.user.tenantId
    );

    await AuditLogService.createLog({
      eventType: 'document-access',
      user: req.user.email,
      resource: req.params.id,
      action: 'Update document',
      status: 'success',
      ipAddress: req.ip,
      tenantId: req.user.tenantId
    });

    flash(res, '/admin/documents', 'success', 'Document updated successfully');
  } catch (err) {
    flash(res, `/admin/documents/${req.params.id}/edit`, 'error', err.message);
  }
}));

router.post('/documents/:id/delete', asyncHandler(async (req, res) => {
  try {
    const doc = await DocumentService.getDocumentById(req.params.id, req.user.tenantId);

    // Delete file if it exists
    if (doc.filePath && fs.existsSync(doc.filePath)) {
      fs.unlinkSync(doc.filePath);
    }

    await DocumentService.deleteDocument(req.params.id, req.user.tenantId);

    await AuditLogService.createLog({
      eventType: 'document-access',
      user: req.user.email,
      resource: req.params.id,
      action: 'Delete document',
      status: 'success',
      ipAddress: req.ip,
      tenantId: req.user.tenantId
    });

    flash(res, '/admin/documents', 'success', 'Document deleted successfully');
  } catch (err) {
    flash(res, '/admin/documents', 'error', err.message);
  }
}));

router.post('/documents/:id/upload', upload.single('file'), asyncHandler(async (req, res) => {
  try {
    if (!req.file) {
      return flash(res, `/admin/documents/${req.params.id}/edit`, 'error', 'No file selected');
    }

    const doc = await DocumentService.getDocumentById(req.params.id, req.user.tenantId);

    // Delete old file if it exists
    if (doc.filePath && fs.existsSync(doc.filePath)) {
      fs.unlinkSync(doc.filePath);
    }

    // Update document with file metadata
    await DocumentService.updateFileMetadata(
      req.params.id,
      {
        filePath: req.file.path,
        fileName: req.file.originalname,
        fileMimeType: req.file.mimetype,
        fileSize: req.file.size
      },
      req.user.tenantId
    );

    await AuditLogService.createLog({
      eventType: 'document-access',
      user: req.user.email,
      resource: req.params.id,
      action: 'Upload file',
      status: 'success',
      ipAddress: req.ip,
      details: { fileName: req.file.originalname, fileSize: req.file.size },
      tenantId: req.user.tenantId
    });

    flash(res, `/admin/documents/${req.params.id}/edit`, 'success', 'File uploaded successfully');
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    flash(res, `/admin/documents/${req.params.id}/edit`, 'error', err.message);
  }
}));

router.get('/documents/:id/download', asyncHandler(async (req, res) => {
  try {
    const doc = await DocumentService.getFileMetadata(req.params.id, req.user.tenantId);

    if (!doc.filePath || !fs.existsSync(doc.filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Increment access count
    await DocumentService.incrementAccessCount(req.params.id, req.user.tenantId);

    await AuditLogService.createLog({
      eventType: 'document-access',
      user: req.user.email,
      resource: req.params.id,
      action: 'Download file',
      status: 'success',
      ipAddress: req.ip,
      tenantId: req.user.tenantId
    });

    // Set proper headers for download
    res.setHeader('Content-Disposition', `attachment; filename="${doc.fileName}"`);
    res.setHeader('Content-Type', doc.fileMimeType || 'application/octet-stream');
    res.setHeader('Content-Length', doc.fileSize);

    // Send file
    const fileStream = fs.createReadStream(doc.filePath);
    fileStream.pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}));

// ===== ACCESS POLICIES (ROLES) =====

router.get('/access-policies', asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;
  const tab = req.query.tab || 'rbac';

  const [roles, policies] = await Promise.all([
    RoleService.getAllRoles(tenantId),
    PolicyService.getAllPolicies({ tenantId })
  ]);

  const flashSuccess = req.query.success || null;
  const flashError = req.query.error || null;

  res.render('admin/access-policies', {
    title: 'Access Policies - KYRA Admin Console',
    current_page: 'policies',
    roles,
    policies,
    activeTab: tab,
    flashSuccess,
    flashError,
    user: req.user,
    csrfToken: req.csrfToken?.() || ''
  });
}));

// ===== ROLES =====

router.get('/access-policies/roles/new', (req, res) => {
  const flashError = req.query.error || null;

  res.render('admin/roles-new', {
    title: 'Create Role - KYRA Admin Console',
    current_page: 'policies',
    flashError,
    user: req.user,
    csrfToken: req.csrfToken?.() || ''
  });
});

router.post('/access-policies/roles', asyncHandler(async (req, res) => {
  try {
    const { name, description, permissions } = req.body;

    if (!name || !description) {
      return flash(res, '/admin/access-policies/roles/new', 'error', 'Name and description are required');
    }

    const permissionsArray = permissions
      ? permissions.split(',').map(p => p.trim()).filter(Boolean)
      : [];

    await RoleService.createRole({
      name,
      description,
      permissions: permissionsArray,
      tenantId: req.user.tenantId
    });

    await AuditLogService.createLog({
      eventType: 'policy-change',
      user: req.user.email,
      resource: name,
      action: 'Create role',
      status: 'success',
      ipAddress: req.ip,
      tenantId: req.user.tenantId
    });

    flash(res, '/admin/access-policies?tab=rbac', 'success', `Role "${name}" created successfully`);
  } catch (err) {
    flash(res, '/admin/access-policies/roles/new', 'error', err.message);
  }
}));

router.get('/access-policies/roles/:id/edit', asyncHandler(async (req, res) => {
  const editRole = await RoleService.getRoleById(req.params.id, req.user.tenantId);
  const flashError = req.query.error || null;

  res.render('admin/roles-edit', {
    title: 'Edit Role - KYRA Admin Console',
    current_page: 'policies',
    editRole,
    flashError,
    user: req.user,
    csrfToken: req.csrfToken?.() || ''
  });
}));

router.post('/access-policies/roles/:id', asyncHandler(async (req, res) => {
  try {
    const { description, permissions } = req.body;

    const permissionsArray = permissions
      ? permissions.split(',').map(p => p.trim()).filter(Boolean)
      : [];

    await RoleService.updateRole(
      req.params.id,
      { description, permissions: permissionsArray },
      req.user.tenantId
    );

    await AuditLogService.createLog({
      eventType: 'policy-change',
      user: req.user.email,
      resource: req.params.id,
      action: 'Update role',
      status: 'success',
      ipAddress: req.ip,
      tenantId: req.user.tenantId
    });

    flash(res, '/admin/access-policies?tab=rbac', 'success', 'Role updated successfully');
  } catch (err) {
    flash(res, `/admin/access-policies/roles/${req.params.id}/edit`, 'error', err.message);
  }
}));

router.post('/access-policies/roles/:id/delete', asyncHandler(async (req, res) => {
  try {
    await RoleService.deleteRole(req.params.id, req.user.tenantId);

    await AuditLogService.createLog({
      eventType: 'policy-change',
      user: req.user.email,
      resource: req.params.id,
      action: 'Delete role',
      status: 'success',
      ipAddress: req.ip,
      tenantId: req.user.tenantId
    });

    flash(res, '/admin/access-policies?tab=rbac', 'success', 'Role deleted successfully');
  } catch (err) {
    flash(res, '/admin/access-policies?tab=rbac', 'error', err.message);
  }
}));

// ===== POLICIES =====

router.get('/access-policies/policies/new', (req, res) => {
  const flashError = req.query.error || null;

  res.render('admin/policies-new', {
    title: 'Create Policy - KYRA Admin Console',
    current_page: 'policies',
    flashError,
    user: req.user,
    csrfToken: req.csrfToken?.() || ''
  });
});

router.post('/access-policies/policies', asyncHandler(async (req, res) => {
  try {
    const { name, type, target, status } = req.body;

    if (!name || !type || !target) {
      return flash(res, '/admin/access-policies/policies/new', 'error', 'Name, type, and target are required');
    }

    await PolicyService.createPolicy({
      name,
      type,
      target,
      status: status || 'active',
      tenantId: req.user.tenantId
    });

    await AuditLogService.createLog({
      eventType: 'policy-change',
      user: req.user.email,
      resource: name,
      action: 'Create policy',
      status: 'success',
      ipAddress: req.ip,
      tenantId: req.user.tenantId
    });

    flash(res, '/admin/access-policies?tab=policies', 'success', `Policy "${name}" created successfully`);
  } catch (err) {
    flash(res, '/admin/access-policies/policies/new', 'error', err.message);
  }
}));

router.get('/access-policies/policies/:id/edit', asyncHandler(async (req, res) => {
  const editPolicy = await PolicyService.getPolicyById(req.params.id, req.user.tenantId);
  const flashError = req.query.error || null;

  res.render('admin/policies-edit', {
    title: 'Edit Policy - KYRA Admin Console',
    current_page: 'policies',
    editPolicy,
    flashError,
    user: req.user,
    csrfToken: req.csrfToken?.() || ''
  });
}));

router.post('/access-policies/policies/:id', asyncHandler(async (req, res) => {
  try {
    const { name, type, target, status } = req.body;

    await PolicyService.updatePolicy(
      req.params.id,
      { name, type, target, status },
      req.user.tenantId
    );

    await AuditLogService.createLog({
      eventType: 'policy-change',
      user: req.user.email,
      resource: req.params.id,
      action: 'Update policy',
      status: 'success',
      ipAddress: req.ip,
      tenantId: req.user.tenantId
    });

    flash(res, '/admin/access-policies?tab=policies', 'success', 'Policy updated successfully');
  } catch (err) {
    flash(res, `/admin/access-policies/policies/${req.params.id}/edit`, 'error', err.message);
  }
}));

router.post('/access-policies/policies/:id/delete', asyncHandler(async (req, res) => {
  try {
    await PolicyService.deletePolicy(req.params.id, req.user.tenantId);

    await AuditLogService.createLog({
      eventType: 'policy-change',
      user: req.user.email,
      resource: req.params.id,
      action: 'Delete policy',
      status: 'success',
      ipAddress: req.ip,
      tenantId: req.user.tenantId
    });

    flash(res, '/admin/access-policies?tab=policies', 'success', 'Policy deleted successfully');
  } catch (err) {
    flash(res, '/admin/access-policies?tab=policies', 'error', err.message);
  }
}));

router.post('/access-policies/policies/:id/activate', asyncHandler(async (req, res) => {
  try {
    await PolicyService.activatePolicy(req.params.id, req.user.tenantId);
    flash(res, '/admin/access-policies?tab=policies', 'success', 'Policy activated');
  } catch (err) {
    flash(res, '/admin/access-policies?tab=policies', 'error', err.message);
  }
}));

router.post('/access-policies/policies/:id/deactivate', asyncHandler(async (req, res) => {
  try {
    await PolicyService.deactivatePolicy(req.params.id, req.user.tenantId);
    flash(res, '/admin/access-policies?tab=policies', 'success', 'Policy deactivated');
  } catch (err) {
    flash(res, '/admin/access-policies?tab=policies', 'error', err.message);
  }
}));

// ===== AUDIT LOGS =====

router.get('/audit-logs', asyncHandler(async (req, res) => {
  const { page, pageSize, search, eventType, status } = getPaginationParams(req);
  const tenantId = req.user.tenantId;

  const result = await AuditLogService.getAllLogs({
    page,
    pageSize: 25,
    search,
    eventType,
    status,
    sortBy: 'createdAt',
    sortOrder: 'desc',
    tenantId
  });

  const filters = { search, eventType, status };
  const flashSuccess = req.query.success || null;

  res.render('admin/audit-logs', {
    title: 'Audit Logs - KYRA Admin Console',
    current_page: 'audit',
    auditLogs: result.data,
    pagination: result.pagination,
    filters,
    flashSuccess,
    user: req.user,
    csrfToken: req.csrfToken?.() || ''
  });
}));

// ===== AGENTS =====

router.get('/agents', asyncHandler(async (req, res) => {
  const { status } = req.query;
  const tenantId = req.user.tenantId;
  const newKey = req.query.newKey || null;

  const agents = await AgentService.getAllAgents({
    status,
    tenantId
  });

  const flashSuccess = req.query.success || null;
  const flashError = req.query.error || null;

  res.render('admin/agents', {
    title: 'Agents - KYRA Admin Console',
    current_page: 'agents',
    agents,
    newKey,
    flashSuccess,
    flashError,
    user: req.user,
    csrfToken: req.csrfToken?.() || ''
  });
}));

router.get('/agents/new', (req, res) => {
  const flashError = req.query.error || null;

  res.render('admin/agents-new', {
    title: 'Register Agent - KYRA Admin Console',
    current_page: 'agents',
    flashError,
    user: req.user,
    csrfToken: req.csrfToken?.() || ''
  });
});

router.post('/agents', asyncHandler(async (req, res) => {
  try {
    const { name, type } = req.body;

    if (!name || !type) {
      return flash(res, '/admin/agents/new', 'error', 'Name and type are required');
    }

    const agent = await AgentService.createAgent({
      name,
      type,
      tenantId: req.user.tenantId,
      status: 'active'
    });

    await AuditLogService.createLog({
      eventType: 'user-management',
      user: req.user.email,
      resource: name,
      action: 'Register agent',
      status: 'success',
      ipAddress: req.ip,
      tenantId: req.user.tenantId
    });

    res.redirect(`/admin/agents?success=Agent registered successfully&newKey=${agent.apiKey}`);
  } catch (err) {
    flash(res, '/admin/agents/new', 'error', err.message);
  }
}));

router.get('/agents/:id/edit', asyncHandler(async (req, res) => {
  const editAgent = await AgentService.getAgentById(req.params.id, req.user.tenantId);
  const flashError = req.query.error || null;

  res.render('admin/agents-edit', {
    title: 'Edit Agent - KYRA Admin Console',
    current_page: 'agents',
    editAgent,
    flashError,
    user: req.user,
    csrfToken: req.csrfToken?.() || ''
  });
}));

router.post('/agents/:id', asyncHandler(async (req, res) => {
  try {
    const { name, type, status } = req.body;

    await AgentService.updateAgent(
      req.params.id,
      { name, type, status },
      req.user.tenantId
    );

    flash(res, '/admin/agents', 'success', 'Agent updated successfully');
  } catch (err) {
    flash(res, `/admin/agents/${req.params.id}/edit`, 'error', err.message);
  }
}));

router.post('/agents/:id/delete', asyncHandler(async (req, res) => {
  try {
    await AgentService.deleteAgent(req.params.id, req.user.tenantId);

    await AuditLogService.createLog({
      eventType: 'user-management',
      user: req.user.email,
      resource: req.params.id,
      action: 'Delete agent',
      status: 'success',
      ipAddress: req.ip,
      tenantId: req.user.tenantId
    });

    flash(res, '/admin/agents', 'success', 'Agent deleted successfully');
  } catch (err) {
    flash(res, '/admin/agents', 'error', err.message);
  }
}));

router.post('/agents/:id/activate', asyncHandler(async (req, res) => {
  try {
    await AgentService.activateAgent(req.params.id, req.user.tenantId);
    flash(res, '/admin/agents', 'success', 'Agent activated');
  } catch (err) {
    flash(res, '/admin/agents', 'error', err.message);
  }
}));

router.post('/agents/:id/deactivate', asyncHandler(async (req, res) => {
  try {
    await AgentService.deactivateAgent(req.params.id, req.user.tenantId);
    flash(res, '/admin/agents', 'success', 'Agent deactivated');
  } catch (err) {
    flash(res, '/admin/agents', 'error', err.message);
  }
}));

router.post('/agents/:id/regenerate-key', asyncHandler(async (req, res) => {
  try {
    const result = await AgentService.regenerateApiKey(req.params.id, req.user.tenantId);

    await AuditLogService.createLog({
      eventType: 'user-management',
      user: req.user.email,
      resource: req.params.id,
      action: 'Regenerate agent API key',
      status: 'success',
      ipAddress: req.ip,
      tenantId: req.user.tenantId
    });

    res.redirect(`/admin/agents?success=API key regenerated&newKey=${result.apiKey}`);
  } catch (err) {
    flash(res, '/admin/agents', 'error', err.message);
  }
}));

// ===== SETTINGS =====

router.get('/settings', asyncHandler(async (req, res) => {
  const OAuthService = require('../services/oauthService');
  const PreferencesService = require('../services/preferencesService');
  const flashSuccess = req.query.success || null;
  const flashError = req.query.error || null;

  const oauthAccounts = await OAuthService.getUserOAuthAccounts(req.user.email, req.user.tenantId);
  const preferences = await PreferencesService.getPreferences(req.user.email, req.user.tenantId);

  res.render('admin/settings', {
    title: 'Settings - KYRA Admin Console',
    current_page: 'settings',
    user: req.user,
    oauthAccounts,
    preferences: preferences.dataValues || preferences,
    twoFactorEnabled: req.user.totpEnabled || false,
    flashSuccess,
    flashError,
    csrfToken: req.csrfToken?.() || ''
  });
}));

router.post('/settings/preferences', asyncHandler(async (req, res) => {
  try {
    const PreferencesService = require('../services/preferencesService');
    const { theme, language, timezone, pageSize, notifyDigestFrequency } = req.body;

    const updates = {};
    if (theme) updates.theme = theme;
    if (language) updates.language = language;
    if (timezone) updates.timezone = timezone;
    if (pageSize) updates.pageSize = parseInt(pageSize);
    if (notifyDigestFrequency) updates.notifyDigestFrequency = notifyDigestFrequency;

    await PreferencesService.updatePreferences(req.user.email, req.user.tenantId, updates);

    await AuditLogService.createLog({
      eventType: 'user-management',
      user: req.user.email,
      resource: 'preferences',
      action: 'Update preferences',
      status: 'success',
      ipAddress: req.ip,
      details: updates,
      tenantId: req.user.tenantId
    });

    res.json({ success: true, message: 'Preferences updated successfully' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
}));

router.post('/settings/notifications', asyncHandler(async (req, res) => {
  try {
    const PreferencesService = require('../services/preferencesService');
    const {
      enableNotifications,
      notifyOnPolicyChange,
      notifyOnDocumentAccess,
      notifyOnFailedLogin,
      notifyDigestFrequency
    } = req.body;

    const notifyPrefs = {};
    if (enableNotifications !== undefined) notifyPrefs.enabled = enableNotifications === 'true' || enableNotifications === true;
    if (notifyOnPolicyChange !== undefined) notifyPrefs.policyChanges = notifyOnPolicyChange === 'true' || notifyOnPolicyChange === true;
    if (notifyOnDocumentAccess !== undefined) notifyPrefs.documentAccess = notifyOnDocumentAccess === 'true' || notifyOnDocumentAccess === true;
    if (notifyOnFailedLogin !== undefined) notifyPrefs.failedLogins = notifyOnFailedLogin === 'true' || notifyOnFailedLogin === true;
    if (notifyDigestFrequency) notifyPrefs.digestFrequency = notifyDigestFrequency;

    await PreferencesService.updateNotificationPreferences(req.user.email, req.user.tenantId, notifyPrefs);

    await AuditLogService.createLog({
      eventType: 'user-management',
      user: req.user.email,
      resource: 'notifications',
      action: 'Update notification preferences',
      status: 'success',
      ipAddress: req.ip,
      tenantId: req.user.tenantId
    });

    res.json({ success: true, message: 'Notification preferences updated successfully' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
}));

router.post('/settings/reset', asyncHandler(async (req, res) => {
  try {
    const PreferencesService = require('../services/preferencesService');
    await PreferencesService.resetToDefaults(req.user.email, req.user.tenantId);

    await AuditLogService.createLog({
      eventType: 'user-management',
      user: req.user.email,
      resource: 'preferences',
      action: 'Reset preferences to defaults',
      status: 'success',
      ipAddress: req.ip,
      tenantId: req.user.tenantId
    });

    res.json({ success: true, message: 'Preferences reset to defaults' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
}));

module.exports = router;
