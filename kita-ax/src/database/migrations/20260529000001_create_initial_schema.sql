-- Migration: 20260529000001_create_initial_schema
-- Description: Baseline schema creation - all 9 core tables
-- Author: system
-- Date: 2026-05-29

-- ===== ENUM TYPES (PostgreSQL requires these before tables) =====

DO $$ BEGIN
  CREATE TYPE "enum_Users_role" AS ENUM ('admin', 'editor', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "enum_Users_status" AS ENUM ('active', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "enum_Documents_classification" AS ENUM ('public', 'internal', 'confidential', 'secret');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "enum_ABACRules_effect" AS ENUM ('allow', 'deny');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "enum_ABACRules_status" AS ENUM ('active', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "enum_Policies_type" AS ENUM ('rbac', 'abac');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "enum_Policies_status" AS ENUM ('active', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "enum_AuditLogs_eventType" AS ENUM ('authentication', 'document-access', 'policy-change', 'user-management');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "enum_AuditLogs_status" AS ENUM ('success', 'failure');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "enum_Agents_type" AS ENUM ('analysis', 'automation');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "enum_Agents_status" AS ENUM ('active', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "enum_UserPreferences_theme" AS ENUM ('light', 'dark', 'auto');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "enum_UserPreferences_notifyDigestFrequency" AS ENUM ('immediate', 'daily', 'weekly', 'never');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ===== TABLES =====

-- Users table
CREATE TABLE IF NOT EXISTS "Users" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  "passwordHash" VARCHAR(255) NOT NULL,
  role "enum_Users_role" NOT NULL DEFAULT 'viewer',
  "tenantId" UUID NOT NULL,
  status "enum_Users_status" NOT NULL DEFAULT 'active',
  "lastLogin" TIMESTAMP,
  "totpSecret" VARCHAR(255),
  "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
  "totpBackupCodes" JSON,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_Users_email" ON "Users"(email);
CREATE INDEX IF NOT EXISTS "idx_Users_tenantId" ON "Users"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_Users_status" ON "Users"(status);

-- Documents table
CREATE TABLE IF NOT EXISTS "Documents" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  classification "enum_Documents_classification" NOT NULL,
  owner VARCHAR(255) NOT NULL,
  "tenantId" UUID NOT NULL,
  "accessCount" INTEGER DEFAULT 0,
  size BIGINT DEFAULT 0,
  description TEXT,
  "filePath" VARCHAR(500),
  "fileName" VARCHAR(255),
  "fileMimeType" VARCHAR(100),
  "fileSize" BIGINT,
  "uploadedAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_Documents_tenantId" ON "Documents"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_Documents_classification" ON "Documents"(classification);
CREATE INDEX IF NOT EXISTS "idx_Documents_owner" ON "Documents"(owner);
CREATE INDEX IF NOT EXISTS "idx_Documents_createdAt" ON "Documents"("createdAt");

-- Roles table
CREATE TABLE IF NOT EXISTS "Roles" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL UNIQUE,
  description VARCHAR(500) NOT NULL,
  permissions JSON NOT NULL DEFAULT '[]',
  "tenantId" UUID NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_Roles_tenantId" ON "Roles"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_Roles_name" ON "Roles"(name);

-- ABACRules table
CREATE TABLE IF NOT EXISTS "ABACRules" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  condition TEXT NOT NULL,
  effect "enum_ABACRules_effect" NOT NULL,
  resources JSON NOT NULL DEFAULT '[]',
  status "enum_ABACRules_status" NOT NULL DEFAULT 'active',
  "tenantId" UUID NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_ABACRules_tenantId" ON "ABACRules"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_ABACRules_status" ON "ABACRules"(status);

-- Policies table
CREATE TABLE IF NOT EXISTS "Policies" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  type "enum_Policies_type" NOT NULL,
  target VARCHAR(100) NOT NULL,
  status "enum_Policies_status" NOT NULL DEFAULT 'active',
  "tenantId" UUID NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_Policies_tenantId" ON "Policies"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_Policies_type" ON "Policies"(type);
CREATE INDEX IF NOT EXISTS "idx_Policies_status" ON "Policies"(status);

-- AuditLogs table (no auto-updating timestamps per model definition)
CREATE TABLE IF NOT EXISTS "AuditLogs" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "eventType" "enum_AuditLogs_eventType" NOT NULL,
  "user" VARCHAR(255) NOT NULL,
  resource VARCHAR(255) NOT NULL,
  action VARCHAR(255) NOT NULL,
  status "enum_AuditLogs_status" NOT NULL,
  "ipAddress" VARCHAR(255),
  details JSON DEFAULT '{}',
  "tenantId" UUID NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_AuditLogs_tenantId" ON "AuditLogs"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_AuditLogs_eventType" ON "AuditLogs"("eventType");
CREATE INDEX IF NOT EXISTS "idx_AuditLogs_status" ON "AuditLogs"(status);
CREATE INDEX IF NOT EXISTS "idx_AuditLogs_user" ON "AuditLogs"("user");
CREATE INDEX IF NOT EXISTS "idx_AuditLogs_createdAt" ON "AuditLogs"("createdAt");

-- Agents table
CREATE TABLE IF NOT EXISTS "Agents" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  type "enum_Agents_type" NOT NULL,
  status "enum_Agents_status" NOT NULL DEFAULT 'active',
  "apiKey" VARCHAR(255) NOT NULL UNIQUE,
  "tenantId" UUID NOT NULL,
  "lastSeen" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_Agents_tenantId" ON "Agents"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_Agents_status" ON "Agents"(status);
CREATE INDEX IF NOT EXISTS "idx_Agents_apiKey" ON "Agents"("apiKey");

-- OAuthAccounts table
CREATE TABLE IF NOT EXISTS "OAuthAccounts" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL,
  "providerId" VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  picture TEXT,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "tenantId" UUID NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, "providerId")
);

CREATE INDEX IF NOT EXISTS "idx_OAuthAccounts_email" ON "OAuthAccounts"(email);
CREATE INDEX IF NOT EXISTS "idx_OAuthAccounts_tenantId" ON "OAuthAccounts"("tenantId");

-- UserPreferences table
CREATE TABLE IF NOT EXISTS "UserPreferences" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  theme "enum_UserPreferences_theme" NOT NULL DEFAULT 'light',
  language VARCHAR(10) NOT NULL DEFAULT 'en',
  timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
  "pageSize" INTEGER NOT NULL DEFAULT 10,
  "enableNotifications" BOOLEAN NOT NULL DEFAULT true,
  "notifyOnPolicyChange" BOOLEAN NOT NULL DEFAULT true,
  "notifyOnDocumentAccess" BOOLEAN NOT NULL DEFAULT false,
  "notifyOnFailedLogin" BOOLEAN NOT NULL DEFAULT true,
  "notifyDigestFrequency" "enum_UserPreferences_notifyDigestFrequency" NOT NULL DEFAULT 'daily',
  "dashboardLayout" JSON NOT NULL DEFAULT '{"widgets": ["metrics", "recent-events", "access-summary"]}',
  "tenantId" UUID NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(email, "tenantId")
);

CREATE INDEX IF NOT EXISTS "idx_UserPreferences_email_tenantId" ON "UserPreferences"(email, "tenantId");
CREATE INDEX IF NOT EXISTS "idx_UserPreferences_tenantId" ON "UserPreferences"("tenantId");
