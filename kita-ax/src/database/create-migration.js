#!/usr/bin/env node

/**
 * Migration File Generator
 * Creates timestamped SQL migration and rollback files
 *
 * Usage:
 *   node create-migration.js add_user_email_verified
 *   # Creates:
 *   #   migrations/20260529143045_add_user_email_verified.sql
 *   #   rollbacks/20260529143045_add_user_email_verified.down.sql
 */

const fs = require('fs');
const path = require('path');

function generateTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

function createMigrationFile(migrationName) {
  const timestamp = generateTimestamp();
  const migrationFilename = `${timestamp}_${migrationName}.sql`;
  const rollbackFilename = `${timestamp}_${migrationName}.down.sql`;

  const migrationPath = path.join(__dirname, 'migrations', migrationFilename);
  const rollbackPath = path.join(__dirname, 'rollbacks', rollbackFilename);

  const migrationTemplate = `-- Migration: ${migrationFilename}
-- Description: ${migrationName}
-- Author:
-- Date: ${new Date().toISOString()}

-- TODO: Add your migration SQL here
-- Example:
-- ALTER TABLE "Users" ADD COLUMN "email_verified" BOOLEAN NOT NULL DEFAULT false;

`;

  const rollbackTemplate = `-- Rollback: ${rollbackFilename}
-- Description: Undo ${migrationName}

-- TODO: Add your rollback SQL here
-- Example:
-- ALTER TABLE "Users" DROP COLUMN "email_verified";

`;

  // Create migrations directory if it doesn't exist
  const migrationsDir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    fs.mkdirSync(migrationsDir, { recursive: true });
  }

  // Create rollbacks directory if it doesn't exist
  const rollbacksDir = path.join(__dirname, 'rollbacks');
  if (!fs.existsSync(rollbacksDir)) {
    fs.mkdirSync(rollbacksDir, { recursive: true });
  }

  // Write files
  fs.writeFileSync(migrationPath, migrationTemplate);
  fs.writeFileSync(rollbackPath, rollbackTemplate);

  console.log('✓ Migration files created:\n');
  console.log(`  Migration:  src/database/migrations/${migrationFilename}`);
  console.log(`  Rollback:   src/database/rollbacks/${rollbackFilename}`);
  console.log('\nEdit both files to add your SQL statements.');
}

const migrationName = process.argv[2];

if (!migrationName) {
  console.error('Usage: node create-migration.js <migration_name>');
  console.error('Example: node create-migration.js add_user_email_verified');
  process.exit(1);
}

// Validate migration name (alphanumeric, underscores, hyphens only)
if (!/^[a-zA-Z0-9_-]+$/.test(migrationName)) {
  console.error('Error: Migration name must contain only alphanumeric characters, underscores, and hyphens');
  process.exit(1);
}

try {
  createMigrationFile(migrationName);
} catch (error) {
  console.error('Error creating migration:', error.message);
  process.exit(1);
}
