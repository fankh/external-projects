#!/usr/bin/env node

/**
 * Database Migration Runner
 * Uses Umzug with SQL files for version control and rollback
 *
 * Usage:
 *   node migrate.js up      - Apply pending migrations
 *   node migrate.js down    - Rollback last applied migration
 *   node migrate.js status  - Show pending and applied migrations
 */

require('dotenv').config();
const { Umzug, SequelizeStorage } = require('umzug');
const { Sequelize } = require('sequelize');
const path = require('path');
const fs = require('fs');

const DB_CONFIG = {
  database: process.env.DB_NAME || 'kyra_admin',
  username: process.env.DB_USER || 'kyra',
  password: process.env.DB_PASSWORD || 'password',
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  dialect: 'postgres',
  logging: false
};

async function createConnection() {
  const sequelize = new Sequelize(DB_CONFIG.database, DB_CONFIG.username, DB_CONFIG.password, {
    host: DB_CONFIG.host,
    port: DB_CONFIG.port,
    dialect: DB_CONFIG.dialect,
    logging: false
  });

  await sequelize.authenticate();
  return sequelize;
}

async function getMigrator(sequelize) {
  return new Umzug({
    migrations: {
      glob: path.join(__dirname, 'migrations/*.sql'),
      resolve: ({ name, path: migPath, context }) => {
        return {
          name,
          up: async () => {
            const sql = fs.readFileSync(migPath, 'utf8');
            await context.sequelize.query(sql);
          },
          down: async () => {
            const rollbackPath = migPath.replace('/migrations/', '/rollbacks/').replace('.sql', '.down.sql');
            if (!fs.existsSync(rollbackPath)) {
              throw new Error(`No rollback file for ${name}: ${rollbackPath}`);
            }
            const sql = fs.readFileSync(rollbackPath, 'utf8');
            await context.sequelize.query(sql);
          }
        };
      }
    },
    context: sequelize,
    storage: new SequelizeStorage({ sequelize, tableName: '_migrations' }),
    logger: console
  });
}

async function runMigrations() {
  const cmd = process.argv[2] || 'up';
  let sequelize;

  try {
    console.log(`Connecting to database: ${DB_CONFIG.database} on ${DB_CONFIG.host}:${DB_CONFIG.port}`);
    sequelize = await createConnection();
    console.log('✓ Database connection successful\n');

    const umzug = await getMigrator(sequelize);

    if (cmd === 'up') {
      console.log('Running pending migrations...');
      const migrations = await umzug.up();
      if (migrations.length === 0) {
        console.log('✓ No pending migrations');
      } else {
        console.log(`✓ Applied ${migrations.length} migration(s):`);
        migrations.forEach(m => console.log(`  - ${m.name}`));
      }
    } else if (cmd === 'down') {
      console.log('Rolling back last migration...');
      const migrations = await umzug.down();
      if (migrations.length === 0) {
        console.log('✓ No migrations to rollback');
      } else {
        console.log(`✓ Rolled back migration:`);
        migrations.forEach(m => console.log(`  - ${m.name}`));
      }
    } else if (cmd === 'status') {
      const pending = await umzug.pending();
      const applied = await umzug.executed();

      console.log('Migration Status:');
      console.log('=================\n');

      if (applied.length > 0) {
        console.log('Applied:');
        applied.forEach(m => console.log(`  [✓] ${m.name}`));
        console.log();
      }

      if (pending.length > 0) {
        console.log('Pending:');
        pending.forEach(m => console.log(`  [ ] ${m.name}`));
      } else if (applied.length > 0) {
        console.log('All migrations applied!');
      } else {
        console.log('No migrations found.');
      }
    } else {
      console.error(`Unknown command: ${cmd}`);
      console.error('Usage: node migrate.js [up|down|status]');
      process.exit(1);
    }

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('✗ Migration error:', error.message);
    if (sequelize) await sequelize.close();
    process.exit(1);
  }
}

runMigrations();
