-- Rollback: 20260529000001_create_initial_schema
-- Description: Drop all tables and ENUM types

-- Drop tables in reverse order of creation
DROP TABLE IF EXISTS "UserPreferences" CASCADE;
DROP TABLE IF EXISTS "OAuthAccounts" CASCADE;
DROP TABLE IF EXISTS "Agents" CASCADE;
DROP TABLE IF EXISTS "AuditLogs" CASCADE;
DROP TABLE IF EXISTS "Policies" CASCADE;
DROP TABLE IF EXISTS "ABACRules" CASCADE;
DROP TABLE IF EXISTS "Roles" CASCADE;
DROP TABLE IF EXISTS "Documents" CASCADE;
DROP TABLE IF EXISTS "Users" CASCADE;

-- Drop ENUM types
DO $$ BEGIN
  DROP TYPE IF EXISTS "enum_UserPreferences_notifyDigestFrequency" CASCADE;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP TYPE IF EXISTS "enum_UserPreferences_theme" CASCADE;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP TYPE IF EXISTS "enum_Agents_status" CASCADE;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP TYPE IF EXISTS "enum_Agents_type" CASCADE;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP TYPE IF EXISTS "enum_AuditLogs_status" CASCADE;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP TYPE IF EXISTS "enum_AuditLogs_eventType" CASCADE;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP TYPE IF EXISTS "enum_Policies_status" CASCADE;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP TYPE IF EXISTS "enum_Policies_type" CASCADE;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP TYPE IF EXISTS "enum_ABACRules_status" CASCADE;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP TYPE IF EXISTS "enum_ABACRules_effect" CASCADE;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP TYPE IF EXISTS "enum_Documents_classification" CASCADE;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP TYPE IF EXISTS "enum_Users_status" CASCADE;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP TYPE IF EXISTS "enum_Users_role" CASCADE;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
