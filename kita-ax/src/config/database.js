/**
 * Database Configuration for KYRA Admin Console
 * Using PostgreSQL with Sequelize ORM
 */

const { Sequelize } = require('sequelize');

// Database credentials from environment variables
const config = {
  development: {
    username: process.env.DB_USER || 'kyra',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'kyra_admin',
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    retry: {
      max: 5,
      timeout: 5000
    }
  },
  test: {
    username: process.env.DB_USER || 'kyra',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'kyra_admin_test',
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: false,
    pool: {
      max: 2,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  },
  production: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: false,
    pool: {
      max: 10,
      min: 2,
      acquire: 30000,
      idle: 10000
    },
    retry: {
      max: 3,
      timeout: 5000
    },
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
  }
};

const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

// Create Sequelize instance
const sequelize = new Sequelize(
  dbConfig.database,
  dbConfig.username,
  dbConfig.password,
  dbConfig
);

// Test connection
async function testConnection() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully');
    return true;
  } catch (error) {
    console.error('❌ Unable to connect to the database:', error.message);
    return false;
  }
}

// Sync models with database
async function syncDatabase(force = false) {
  try {
    await sequelize.sync({ force });
    console.log('✅ Database synchronized successfully');
    return true;
  } catch (error) {
    console.error('❌ Database synchronization failed:', error.message);
    return false;
  }
}

// Close database connection
async function closeConnection() {
  try {
    await sequelize.close();
    console.log('Database connection closed');
  } catch (error) {
    console.error('Error closing database connection:', error.message);
  }
}

module.exports = {
  sequelize,
  testConnection,
  syncDatabase,
  closeConnection,
  config: dbConfig
};
