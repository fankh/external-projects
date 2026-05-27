/**
 * Database Models for KYRA Admin Console
 * Using Sequelize ORM with PostgreSQL
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// ===== USER MODEL =====
const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  passwordHash: {
    type: DataTypes.STRING,
    allowNull: false
  },
  role: {
    type: DataTypes.ENUM('admin', 'editor', 'viewer'),
    defaultValue: 'viewer',
    allowNull: false
  },
  tenantId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    defaultValue: 'active',
    allowNull: false
  },
  lastLogin: {
    type: DataTypes.DATE,
    allowNull: true
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  indexes: [
    { fields: ['email'] },
    { fields: ['tenantId'] },
    { fields: ['status'] }
  ]
});

// ===== DOCUMENT MODEL =====
const Document = sequelize.define('Document', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  classification: {
    type: DataTypes.ENUM('public', 'internal', 'confidential', 'secret'),
    allowNull: false
  },
  owner: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      isEmail: true
    }
  },
  tenantId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  accessCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  size: {
    type: DataTypes.BIGINT,
    defaultValue: 0
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  indexes: [
    { fields: ['tenantId'] },
    { fields: ['classification'] },
    { fields: ['owner'] },
    { fields: ['createdAt'] }
  ]
});

// ===== ROLE MODEL =====
const Role = sequelize.define('Role', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  description: {
    type: DataTypes.STRING(500),
    allowNull: false
  },
  permissions: {
    type: DataTypes.JSON,
    defaultValue: [],
    allowNull: false
  },
  tenantId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  indexes: [
    { fields: ['tenantId'] },
    { fields: ['name'] }
  ]
});

// ===== ABAC RULE MODEL =====
const ABACRule = sequelize.define('ABACRule', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  condition: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  effect: {
    type: DataTypes.ENUM('allow', 'deny'),
    allowNull: false
  },
  resources: {
    type: DataTypes.JSON,
    defaultValue: [],
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    defaultValue: 'active',
    allowNull: false
  },
  tenantId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  indexes: [
    { fields: ['tenantId'] },
    { fields: ['status'] }
  ]
});

// ===== POLICY MODEL =====
const Policy = sequelize.define('Policy', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  type: {
    type: DataTypes.ENUM('rbac', 'abac'),
    allowNull: false
  },
  target: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    defaultValue: 'active',
    allowNull: false
  },
  tenantId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  indexes: [
    { fields: ['tenantId'] },
    { fields: ['type'] },
    { fields: ['status'] }
  ]
});

// ===== AUDIT LOG MODEL =====
const AuditLog = sequelize.define('AuditLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  eventType: {
    type: DataTypes.ENUM('authentication', 'document-access', 'policy-change', 'user-management'),
    allowNull: false
  },
  user: {
    type: DataTypes.STRING,
    allowNull: false
  },
  resource: {
    type: DataTypes.STRING,
    allowNull: false
  },
  action: {
    type: DataTypes.STRING,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('success', 'failure'),
    allowNull: false
  },
  ipAddress: {
    type: DataTypes.STRING,
    allowNull: true
  },
  details: {
    type: DataTypes.JSON,
    defaultValue: {},
    allowNull: true
  },
  tenantId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  indexes: [
    { fields: ['tenantId'] },
    { fields: ['eventType'] },
    { fields: ['status'] },
    { fields: ['user'] },
    { fields: ['createdAt'] }
  ],
  timestamps: false
});

// ===== AGENT MODEL =====
const Agent = sequelize.define('Agent', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  type: {
    type: DataTypes.ENUM('analysis', 'automation'),
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    defaultValue: 'active',
    allowNull: false
  },
  apiKey: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  tenantId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  lastSeen: {
    type: DataTypes.DATE,
    allowNull: true
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  indexes: [
    { fields: ['tenantId'] },
    { fields: ['status'] },
    { fields: ['apiKey'] }
  ]
});

// ===== MODEL ASSOCIATIONS =====
// Users and Documents
User.hasMany(Document, { foreignKey: 'owner', sourceKey: 'email' });
Document.belongsTo(User, { foreignKey: 'owner', targetKey: 'email' });

// Tenant-based relationships
User.hasMany(AuditLog, { foreignKey: 'user', sourceKey: 'email' });
AuditLog.belongsTo(User, { foreignKey: 'user', targetKey: 'email' });

module.exports = {
  User,
  Document,
  Role,
  ABACRule,
  Policy,
  AuditLog,
  Agent
};
