#!/usr/bin/env node

/**
 * Database Seeding Script - Populate initial data
 * Usage: npm run seed
 */

require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const database = require('../config/database');
const UserService = require('../services/userService');
const DocumentService = require('../services/documentService');
const RoleService = require('../services/roleService');
const PolicyService = require('../services/policyService');
const AuditLogService = require('../services/auditLogService');
const AgentService = require('../services/agentService');

// Use a fixed UUID for consistent seeding
const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';

async function seedDatabase() {
  try {
    console.log('🌱 Starting database seeding...\n');

    // Initialize database
    await database.testConnection();
    console.log('✓ Database connection established');

    await database.syncDatabase();
    console.log('✓ Database models synchronized\n');

    // Seed Roles
    console.log('📋 Seeding roles...');
    const roles = await seedRoles();
    console.log(`✓ Created ${roles.length} roles\n`);

    // Seed Users
    console.log('👥 Seeding users...');
    const users = await seedUsers();
    console.log(`✓ Created ${users.length} users\n`);

    // Seed Documents
    console.log('📄 Seeding documents...');
    const documents = await seedDocuments();
    console.log(`✓ Created ${documents.length} documents\n`);

    // Seed Policies
    console.log('🔒 Seeding policies...');
    const policies = await seedPolicies();
    console.log(`✓ Created ${policies.length} policies\n`);

    // Seed Agents
    console.log('🤖 Seeding agents...');
    const agents = await seedAgents();
    console.log(`✓ Created ${agents.length} agents\n`);

    // Seed Audit Logs
    console.log('📝 Seeding audit logs...');
    const auditLogs = await seedAuditLogs();
    console.log(`✓ Created ${auditLogs.length} audit logs\n`);

    console.log('✅ Database seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database seeding failed:', error.message);
    process.exit(1);
  }
}

async function seedRoles() {
  const rolesToCreate = [
    {
      name: 'admin',
      description: 'Administrator with full access',
      permissions: [
        'read:all',
        'write:all',
        'delete:all',
        'manage:users',
        'manage:policies',
        'view:audit-logs'
      ]
    },
    {
      name: 'editor',
      description: 'Editor with read and write access',
      permissions: [
        'read:documents',
        'write:documents',
        'read:policies',
        'write:policies'
      ]
    },
    {
      name: 'viewer',
      description: 'Viewer with read-only access',
      permissions: [
        'read:documents',
        'read:policies',
        'read:audit-logs'
      ]
    }
  ];

  const createdRoles = [];
  for (const roleData of rolesToCreate) {
    try {
      const role = await RoleService.createRole({
        ...roleData,
        tenantId: TENANT_ID
      });
      createdRoles.push(role);
    } catch (error) {
      if (!error.message.includes('already exists')) {
        throw error;
      }
    }
  }

  return createdRoles;
}

async function seedUsers() {
  const usersToCreate = [
    {
      email: 'admin@seekerslab.com',
      password: 'xmUoX0OA5XvSH4csBJbw',
      role: 'admin',
      status: 'active'
    },
    {
      email: 'editor@seekerslab.com',
      password: 'editor123456',
      role: 'editor',
      status: 'active'
    },
    {
      email: 'viewer@seekerslab.com',
      password: 'viewer123456',
      role: 'viewer',
      status: 'active'
    },
    {
      email: 'analyst@seekerslab.com',
      password: 'analyst123456',
      role: 'editor',
      status: 'active'
    }
  ];

  const createdUsers = [];
  for (const userData of usersToCreate) {
    try {
      const user = await UserService.createUser({
        ...userData,
        tenantId: TENANT_ID
      });
      createdUsers.push(user);
    } catch (error) {
      if (!error.message.includes('already exists')) {
        throw error;
      }
    }
  }

  return createdUsers;
}

async function seedDocuments() {
  const documentsToCreate = [
    {
      title: 'AI Guardrail Architecture Design',
      classification: 'confidential',
      owner: 'admin@seekerslab.com',
      description: 'Technical architecture documentation for AI guardrail system',
      size: 1024000
    },
    {
      title: 'Security Compliance Report',
      classification: 'secret',
      owner: 'admin@seekerslab.com',
      description: 'Quarterly security and compliance audit results',
      size: 2048000
    },
    {
      title: 'Public API Documentation',
      classification: 'public',
      owner: 'editor@seekerslab.com',
      description: 'API documentation for external developers',
      size: 512000
    },
    {
      title: 'Internal Training Materials',
      classification: 'internal',
      owner: 'editor@seekerslab.com',
      description: 'Training resources for team members',
      size: 3072000
    }
  ];

  const createdDocs = [];
  for (const docData of documentsToCreate) {
    try {
      const doc = await DocumentService.createDocument({
        ...docData,
        tenantId: TENANT_ID
      });
      createdDocs.push(doc);
    } catch (error) {
      console.warn(`  ⚠ Could not create document "${docData.title}":`, error.message);
    }
  }

  return createdDocs;
}

async function seedPolicies() {
  const policiesToCreate = [
    {
      name: 'RBAC Default Policy',
      type: 'rbac',
      target: 'all-resources',
      status: 'active'
    },
    {
      name: 'ABAC Attribute Policy',
      type: 'abac',
      target: 'sensitive-documents',
      status: 'active'
    },
    {
      name: 'Time-Based Access Control',
      type: 'abac',
      target: 'after-hours',
      status: 'active'
    }
  ];

  const createdPolicies = [];
  for (const policyData of policiesToCreate) {
    try {
      const policy = await PolicyService.createPolicy({
        ...policyData,
        tenantId: TENANT_ID
      });
      createdPolicies.push(policy);
    } catch (error) {
      if (!error.message.includes('Validation error')) {
        console.warn(`  ⚠ Could not create policy "${policyData.name}":`, error.message);
      }
    }
  }

  return createdPolicies;
}

async function seedAgents() {
  const agentsToCreate = [
    {
      name: 'Content Analyzer',
      type: 'analysis',
      status: 'active'
    },
    {
      name: 'Automated Moderation',
      type: 'automation',
      status: 'active'
    },
    {
      name: 'Security Auditor',
      type: 'analysis',
      status: 'active'
    }
  ];

  const createdAgents = [];
  for (const agentData of agentsToCreate) {
    try {
      const agent = await AgentService.createAgent({
        ...agentData,
        tenantId: TENANT_ID
      });
      createdAgents.push(agent);
    } catch (error) {
      console.warn(`  ⚠ Could not create agent "${agentData.name}":`, error.message);
    }
  }

  return createdAgents;
}

async function seedAuditLogs() {
  const logsToCreate = [
    {
      eventType: 'authentication',
      user: 'admin@seekerslab.com',
      resource: 'dashboard',
      action: 'Login successful',
      status: 'success',
      ipAddress: '127.0.0.1',
      details: { browser: 'Chrome', os: 'Linux' }
    },
    {
      eventType: 'document-access',
      user: 'editor@seekerslab.com',
      resource: 'doc-001',
      action: 'View document',
      status: 'success',
      ipAddress: '127.0.0.1',
      details: { documentTitle: 'Architecture Design' }
    },
    {
      eventType: 'policy-change',
      user: 'admin@seekerslab.com',
      resource: 'policy-001',
      action: 'Update policy',
      status: 'success',
      ipAddress: '127.0.0.1',
      details: { policyName: 'RBAC Default Policy', changes: ['permissions'] }
    },
    {
      eventType: 'user-management',
      user: 'admin@seekerslab.com',
      resource: 'user-002',
      action: 'Create user',
      status: 'success',
      ipAddress: '127.0.0.1',
      details: { newUserEmail: 'editor@seekerslab.com' }
    }
  ];

  const createdLogs = [];
  for (const logData of logsToCreate) {
    try {
      const log = await AuditLogService.createLog({
        ...logData,
        tenantId: TENANT_ID
      });
      createdLogs.push(log);
    } catch (error) {
      console.warn(`  ⚠ Could not create audit log for "${logData.resource}":`, error.message);
    }
  }

  return createdLogs;
}

// Run seeding
seedDatabase();
