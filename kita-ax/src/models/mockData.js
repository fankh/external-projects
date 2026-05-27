// Mock database for Phase 2 development
// In production, these would be replaced with real database queries

const mockUsers = [
  {
    id: 'user-001',
    email: 'admin@seekerslab.com',
    role: 'admin',
    tenantId: 'tenant-001',
    lastLogin: new Date(Date.now() - 3600000),
    status: 'active',
    createdAt: new Date(Date.now() - 30 * 24 * 3600000)
  },
  {
    id: 'user-002',
    email: 'alice.chen@seekerslab.com',
    role: 'editor',
    tenantId: 'tenant-001',
    lastLogin: new Date(Date.now() - 7200000),
    status: 'active',
    createdAt: new Date(Date.now() - 60 * 24 * 3600000)
  },
  {
    id: 'user-003',
    email: 'bob.smith@seekerslab.com',
    role: 'viewer',
    tenantId: 'tenant-001',
    lastLogin: new Date(Date.now() - 86400000),
    status: 'active',
    createdAt: new Date(Date.now() - 90 * 24 * 3600000)
  },
  {
    id: 'user-004',
    email: 'carol.johnson@seekerslab.com',
    role: 'editor',
    tenantId: 'tenant-001',
    lastLogin: new Date(Date.now() - 172800000),
    status: 'inactive',
    createdAt: new Date(Date.now() - 120 * 24 * 3600000)
  }
];

const mockDocuments = [
  {
    id: 'doc-001',
    title: 'AI Security Framework v2.0',
    classification: 'confidential',
    owner: 'alice.chen@seekerslab.com',
    uploadedAt: new Date(Date.now() - 86400000),
    accessCount: 42,
    size: 2048000
  },
  {
    id: 'doc-002',
    title: 'Incident Response Plan',
    classification: 'secret',
    owner: 'admin@seekerslab.com',
    uploadedAt: new Date(Date.now() - 172800000),
    accessCount: 15,
    size: 512000
  },
  {
    id: 'doc-003',
    title: 'Public API Documentation',
    classification: 'public',
    owner: 'bob.smith@seekerslab.com',
    uploadedAt: new Date(Date.now() - 259200000),
    accessCount: 238,
    size: 3145728
  },
  {
    id: 'doc-004',
    title: 'Internal Security Guidelines',
    classification: 'internal',
    owner: 'alice.chen@seekerslab.com',
    uploadedAt: new Date(Date.now() - 345600000),
    accessCount: 87,
    size: 1024000
  }
];

const mockRoles = [
  {
    name: 'admin',
    description: 'Full system access with all permissions',
    permissions: ['read:users', 'write:users', 'read:documents', 'write:documents', 'read:policies', 'write:policies', 'read:audit', 'write:audit'],
    userCount: 1
  },
  {
    name: 'editor',
    description: 'Can create and modify documents and access policies',
    permissions: ['read:users', 'read:documents', 'write:documents', 'read:policies', 'write:policies', 'read:audit'],
    userCount: 2
  },
  {
    name: 'viewer',
    description: 'Read-only access to documents and audit logs',
    permissions: ['read:documents', 'read:audit'],
    userCount: 1
  }
];

const mockABACRules = [
  {
    name: 'Executive Access',
    condition: 'department == "executive" AND clearance >= 3',
    effect: 'allow',
    resources: ['doc-001', 'doc-002'],
    status: 'active'
  },
  {
    name: 'Security Team Access',
    condition: 'department == "security" OR role == "admin"',
    effect: 'allow',
    resources: ['doc-002', 'doc-003'],
    status: 'active'
  },
  {
    name: 'Finance Document Restriction',
    condition: 'classification == "finance" AND department != "finance"',
    effect: 'deny',
    resources: ['doc-001'],
    status: 'inactive'
  }
];

const mockPolicies = [
  {
    name: 'Default User Policy',
    type: 'rbac',
    target: 'all_users',
    status: 'active',
    createdAt: new Date(Date.now() - 365 * 24 * 3600000)
  },
  {
    name: 'Sensitive Document Access',
    type: 'abac',
    target: 'secret_documents',
    status: 'active',
    createdAt: new Date(Date.now() - 180 * 24 * 3600000)
  },
  {
    name: 'Legacy System Override',
    type: 'rbac',
    target: 'legacy_users',
    status: 'inactive',
    createdAt: new Date(Date.now() - 90 * 24 * 3600000)
  }
];

const mockAuditLogs = [
  {
    timestamp: new Date(Date.now() - 300000),
    eventType: 'authentication',
    user: 'admin@seekerslab.com',
    resource: 'auth/login',
    action: 'Login successful',
    status: 'success',
    ipAddress: '192.168.1.100'
  },
  {
    timestamp: new Date(Date.now() - 600000),
    eventType: 'document-access',
    user: 'alice.chen@seekerslab.com',
    resource: 'doc-001',
    action: 'Accessed document',
    status: 'success',
    ipAddress: '192.168.1.101'
  },
  {
    timestamp: new Date(Date.now() - 900000),
    eventType: 'policy-change',
    user: 'admin@seekerslab.com',
    resource: 'policies/default-user',
    action: 'Modified access policy',
    status: 'success',
    ipAddress: '192.168.1.100'
  },
  {
    timestamp: new Date(Date.now() - 1200000),
    eventType: 'user-management',
    user: 'admin@seekerslab.com',
    resource: 'users/user-004',
    action: 'Disabled user account',
    status: 'success',
    ipAddress: '192.168.1.100'
  },
  {
    timestamp: new Date(Date.now() - 1800000),
    eventType: 'authentication',
    user: 'unknown',
    resource: 'auth/login',
    action: 'Failed login attempt',
    status: 'failure',
    ipAddress: '203.0.113.45'
  },
  {
    timestamp: new Date(Date.now() - 2400000),
    eventType: 'document-access',
    user: 'carol.johnson@seekerslab.com',
    resource: 'doc-002',
    action: 'Access denied',
    status: 'failure',
    ipAddress: '192.168.1.102'
  }
];

const mockAgents = [
  {
    name: 'Compliance Analyzer',
    type: 'analysis',
    status: 'active',
    apiKey: 'sk-agent-001-compliance-analyzer-xyz',
    lastSeen: new Date(Date.now() - 600000),
    requests24h: 2341
  },
  {
    name: 'Document Classifier',
    type: 'automation',
    status: 'active',
    apiKey: 'sk-agent-002-document-classifier-abc',
    lastSeen: new Date(Date.now() - 1200000),
    requests24h: 5623
  },
  {
    name: 'Risk Assessor',
    type: 'analysis',
    status: 'inactive',
    apiKey: 'sk-agent-003-risk-assessor-def',
    lastSeen: new Date(Date.now() - 86400000),
    requests24h: 0
  }
];

const mockAgentGroups = [
  {
    name: 'Analysis Agents',
    type: 'analysis',
    description: 'Agents focused on document and risk analysis',
    agentCount: 2,
    permissions: ['read:documents', 'read:audit']
  },
  {
    name: 'Automation Agents',
    type: 'automation',
    description: 'Agents that perform automated classification and tagging',
    agentCount: 1,
    permissions: ['read:documents', 'write:documents']
  }
];

const mockModels = [
  {
    name: 'GPT-4 Turbo',
    version: '2024-04',
    provider: 'openai',
    maxTokens: 128000,
    costPer1k: 0.03,
    status: 'active'
  },
  {
    name: 'Claude 3 Opus',
    version: '2024-02',
    provider: 'anthropic',
    maxTokens: 200000,
    costPer1k: 0.015,
    status: 'active'
  },
  {
    name: 'Llama 2 70B',
    version: '2024-01',
    provider: 'meta',
    maxTokens: 4096,
    costPer1k: 0.001,
    status: 'active'
  }
];

module.exports = {
  mockUsers,
  mockDocuments,
  mockRoles,
  mockABACRules,
  mockPolicies,
  mockAuditLogs,
  mockAgents,
  mockAgentGroups,
  mockModels
};
