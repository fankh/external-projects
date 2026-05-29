# Phase 18: Database Migrations System

## Overview

Phase 18 introduces a versioned database migration system using **Umzug** and raw SQL files. This replaces the previous `sequelize.sync()` approach with a proper change-tracking system that supports rollbacks, versioning, and reproducible deployments.

**Key Features:**
- Version-controlled SQL migrations with timestamps
- Automatic rollback capability
- Migration tracking in database (`_migrations` table)
- Works alongside existing `db:sync` for local development
- No breaking changes to current workflow

## Architecture

### Migration Engine: Umzug

`umzug` is the official Sequelize migration engine. It provides:
- Migration execution with `up()` and `down()` support
- Automatic tracking of applied migrations
- Clean CLI interface

### Migration Files

Migrations are organized in two directories:

```
src/database/
├── migrations/
│   ├── 20260529000001_create_initial_schema.sql
│   └── 20260529000002_future_migration.sql
├── rollbacks/
│   ├── 20260529000001_create_initial_schema.down.sql
│   └── 20260529000002_future_migration.down.sql
├── migrate.js
└── create-migration.js
```

**Naming Convention:** `YYYYMMDDhhmmss_description.sql`

The timestamp prefix ensures natural ordering and prevents conflicts.

### Migration Tracking

The `_migrations` table tracks all applied migrations:

```sql
CREATE TABLE _migrations (
  name VARCHAR(255) NOT NULL PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Each row represents one successfully applied migration. New migrations must have unique names.

## CLI Commands

### Apply Pending Migrations

```bash
npm run db:migrate
```

Applies all pending migrations in timestamp order. Safe to run multiple times — already-applied migrations are skipped.

**Output:**
```
Connecting to database: kyra_admin on localhost:5432
✓ Database connection successful

Running pending migrations...
✓ Applied 1 migration(s):
  - 20260529000001_create_initial_schema
```

### Rollback Last Migration

```bash
npm run db:migrate:undo
```

Rolls back the most recently applied migration using its `.down.sql` file.

**Output:**
```
Rolling back last migration...
✓ Rolled back migration:
  - 20260529000001_create_initial_schema
```

### Check Migration Status

```bash
npm run db:migrate:status
```

Shows all pending and applied migrations.

**Output:**
```
Migration Status:
=================

Applied:
  [✓] 20260529000001_create_initial_schema

Pending:
  [ ] 20260529000002_example_migration
```

### Create New Migration

```bash
npm run db:migrate:create add_user_email_verified
```

Generates a timestamped migration file pair:

```
✓ Migration files created:

  Migration:  src/database/migrations/20260529143045_add_user_email_verified.sql
  Rollback:   src/database/rollbacks/20260529143045_add_user_email_verified.down.sql

Edit both files to add your SQL statements.
```

## Migration Workflow

### 1. Create Migration Files

```bash
npm run db:migrate:create add_document_tags
```

### 2. Edit Migration File

Edit `src/database/migrations/[timestamp]_add_document_tags.sql`:

```sql
-- Migration: 20260529143045_add_document_tags
-- Description: Add tags column to Documents table
-- Author: your-name
-- Date: 2026-05-29

ALTER TABLE "Documents" ADD COLUMN tags JSON DEFAULT '[]';
CREATE INDEX idx_Documents_tags ON "Documents" USING gin(tags);
```

### 3. Edit Rollback File

Edit `src/database/rollbacks/[timestamp]_add_document_tags.down.sql`:

```sql
-- Rollback: 20260529143045_add_document_tags
-- Description: Remove tags column from Documents table

DROP INDEX IF EXISTS idx_Documents_tags;
ALTER TABLE "Documents" DROP COLUMN tags;
```

### 4. Test Migration

```bash
npm run db:migrate:status  # verify pending
npm run db:migrate        # apply migration
npm run db:migrate:status  # verify applied
```

### 5. Test Rollback

```bash
npm run db:migrate:undo   # rollback
npm run db:migrate:status # verify reverted
npm run db:migrate        # re-apply for testing
```

### 6. Commit Migration Files

```bash
git add src/database/migrations/[timestamp]_add_document_tags.sql
git add src/database/rollbacks/[timestamp]_add_document_tags.down.sql
git commit -m "migration: add tags column to Documents"
```

### 7. Deploy

On target environment:

```bash
npm install          # gets any new package.json changes
npm run db:migrate   # applies migrations
npm start            # starts app with new schema
```

## Baseline Migration

### 20260529000001_create_initial_schema.sql

The baseline migration creates all 9 core tables:

- `Users` — admin, editors, viewers with TOTP 2FA support
- `Documents` — classified documents (public/internal/confidential/secret)
- `Roles` — role definitions with permissions
- `ABACRules` — Attribute-Based Access Control rules
- `Policies` — RBAC and ABAC policy assignments
- `AuditLogs` — immutable audit trail
- `Agents` — automation and analysis agents
- `OAuthAccounts` — OAuth provider integrations (Google, GitHub)
- `UserPreferences` — per-user UI and notification settings

All tables are created with `IF NOT EXISTS` to make the migration idempotent — it's safe to run on a database that was previously synchronized via `sequelize.sync()`.

## npm Scripts Integration

### Complete Setup

```bash
npm run db:setup
```

Runs `db:migrate` followed by `db:seed` — the full initialization.

### Local Development

Keep using `db:sync` for quick schema updates during development:

```bash
npm run db:sync
```

`db:sync` still works as before — it uses Sequelize's `sync()` method for additive-only changes. Migrations are for production and CI/CD.

## Best Practices

### ✓ DO

- **Use migrations for schema changes** — always create a migration for changes to tables, columns, indexes
- **Include both up and down** — every migration needs a rollback
- **Test before committing** — run the migration up and down to verify it works
- **Be specific in descriptions** — use clear table/column names in comments
- **Idempotent CREATE/DROP** — use `IF NOT EXISTS` / `IF NOT` to allow safe re-runs
- **Keep migrations small** — one logical change per migration file

### ✗ DON'T

- **Don't modify applied migrations** — once applied to production, a migration is immutable. Create a new one instead.
- **Don't skip rollbacks** — always test the `.down.sql` file before committing
- **Don't use Sequelize models in migrations** — SQL gives you full control. Models can change; SQL is stable.
- **Don't drop ENUM types carelessly** — PostgreSQL requires types before tables that use them
- **Don't leave TODO comments** — every migration should be ready to apply

## Error Handling

### Migration Fails Partway Through

If a migration fails midway:

1. Check the error message — the migration was not completed
2. Fix the SQL (if syntax error)
3. Re-run `npm run db:migrate` — it will continue from where it failed
4. The `_migrations` table will only have rows for successful migrations

### Rollback Fails

If a rollback fails:

1. Check the `.down.sql` file for errors
2. Fix the SQL
3. Manually apply the SQL to the database if needed
4. Re-run `npm run db:migrate:undo`

## CI/CD Integration

### Pre-Deployment

In your CI/CD pipeline, before starting the app:

```bash
npm install
npm run db:migrate   # apply all pending migrations
npm start            # starts app with new schema
```

### Staging/Production

Track migrations in version control (they're just `.sql` files). Deployments pull the latest migration files and apply them.

```bash
git pull origin main
npm install
npm run db:migrate
npm start
```

## Compatibility

### With Existing `db:sync`

The migration system **does not replace** `db:sync`. Both work independently:

- `npm run db:sync` — Sequelize's sync, for additive changes during dev
- `npm run db:migrate` — Version-controlled migrations, for production

Use `db:sync` for quick local development. Use migrations for production deployments.

### With Sequelize Models

Migration files are written in SQL, not Sequelize. The models in `src/models/index.js` are still used for:

- Application logic (queries, associations, validation)
- Seeding test data

The migrations ensure the database schema matches what the models expect. The baseline migration (`20260529000001_create_initial_schema.sql`) captures the exact schema from the current models.

## Troubleshooting

### "No migrations found"

Check that `.sql` files exist in `src/database/migrations/`:

```bash
ls src/database/migrations/
```

### "Migration already applied"

The `_migrations` table already has an entry. If you need to re-run it, manually delete the row:

```sql
DELETE FROM _migrations WHERE name = '20260529000002_your_migration';
```

Then re-run:

```bash
npm run db:migrate
```

### Database connection fails

Check credentials in `.env`:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=kyra_admin
DB_USER=kyra
DB_PASSWORD=password
```

Verify PostgreSQL is running:

```bash
psql -h localhost -U kyra -d kyra_admin -c "SELECT version();"
```

## Files Created

| File | Purpose |
|---|---|
| `src/database/migrate.js` | CLI runner — handles up/down/status commands |
| `src/database/create-migration.js` | Generates timestamped migration file pairs |
| `src/database/migrations/20260529000001_create_initial_schema.sql` | Baseline: creates all 9 tables with ENUM types |
| `src/database/rollbacks/20260529000001_create_initial_schema.down.sql` | Baseline rollback: drops all tables and types |

## Updated Scripts

| Script | Command | Purpose |
|---|---|---|
| `npm run db:migrate` | `node src/database/migrate.js up` | Apply migrations |
| `npm run db:migrate:undo` | `node src/database/migrate.js down` | Rollback last |
| `npm run db:migrate:status` | `node src/database/migrate.js status` | Show status |
| `npm run db:migrate:create` | `node src/database/create-migration.js` | Generate migration |
| `npm run db:seed` | `node src/scripts/seed-database.js` | Seed test data |
| `npm run db:setup` | `npm run db:migrate && npm run db:seed` | Full init |
| `npm run db:sync` | (unchanged) | Quick sync for dev |

## Next Steps

**After Phase 18:**
- All schema changes go through migrations (never touch `.sql` directly)
- Production deployments run `npm run db:migrate` before starting the app
- Developers use `npm run db:sync` for quick local changes, migrations for tracked changes

**Future Migrations:**
- Add new columns: `npm run db:migrate:create add_user_phone`
- Modify indexes: `npm run db:migrate:create add_index_documents_owner`
- Change constraints: `npm run db:migrate:create add_not_null_constraint`

## References

- [Umzug Documentation](https://github.com/sequelize/umzug)
- [PostgreSQL Data Types](https://www.postgresql.org/docs/current/dataypes.html)
- [PostgreSQL ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html)
- [Database Migration Best Practices](https://liquibase.com/get-started/best-practices)
