/**
 * KYRA Admin Console - Main Express Application
 * Phase 1-5: Foundation + Database Integration
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const swaggerUi = require('swagger-ui-express');
const fs = require('fs');
const database = require('./config/database');

// Sentry error tracking (MUST be early)
const { getSentryMiddleware, getSentryErrorHandler } = require('./config/sentry');
const ErrorTrackingService = require('./services/errorTrackingService');

// Middleware
const sessionMiddleware = require('./config/session');
const {
  cors,
  helmet,
  limiter,
  cookieParser,
  csrfProtection
} = require('./middleware/security');
const { requireTwoFactor } = require('./middleware/auth');
const correlationIdMiddleware = require('./middleware/correlationId');
const requestLoggerMiddleware = require('./middleware/requestLogger');
const performanceLoggerMiddleware = require('./middleware/performanceLogger');
const logger = require('./config/logger');

// Routes
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const apiRoutesV1 = require('./routes/api-v1');

// Load OpenAPI spec
const openApiSpec = JSON.parse(fs.readFileSync(path.join(__dirname, 'docs/openapi.json'), 'utf8'));

// Create Express app
const app = express();

// ===== MIDDLEWARE SETUP (Order matters!) =====

// 0. Sentry error tracking (MUST be first)
const sentryMiddleware = getSentryMiddleware();
sentryMiddleware.forEach(middleware => app.use(middleware));

// 1. Trust proxy (for production)
app.set('trust proxy', 1);

// 2. Security middleware
app.use(helmet);
app.use(cors);
app.use(limiter);
app.use(cookieParser);

// 2.5. Logging middleware (early in chain for correlation ID propagation)
app.use(correlationIdMiddleware);
app.use(performanceLoggerMiddleware);
app.use(requestLoggerMiddleware);

// 3. Body parsing
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

// 4. View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 5. Static files
app.use(express.static(path.join(__dirname, 'public')));

// 6. Session middleware (MUST be before routes)
app.use(sessionMiddleware);

// 6.5. Passport middleware (MUST be after session)
const passport = require('passport');
require('./config/passport');
app.use(passport.initialize());
app.use(passport.session());

// 6.7. User preferences middleware (MUST be after authentication)
const preferencesMiddleware = require('./middleware/preferences');
app.use(preferencesMiddleware);

// 7. CSRF protection (MUST be after session)
app.use(csrfProtection);

// ===== ROUTES SETUP (Order matters!) =====

// 1. Health check (no auth required)
app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// 2. Swagger UI documentation (no auth required)
app.use('/api/docs', swaggerUi.serve);
app.get('/api/docs', swaggerUi.setup(openApiSpec, {
  swaggerOptions: {
    url: '/api/openapi.json',
    deepLinking: true
  }
}));

// 2.5. OpenAPI spec endpoint
app.get('/api/openapi.json', (req, res) => {
  res.json(openApiSpec);
});

// 3. Authentication routes (login, logout)
app.use('/', authRoutes);

// 3.5. 2FA enforcement (MUST be after auth routes, before protected routes)
app.use(requireTwoFactor);

// 4. API v1 routes (ALL require authentication)
app.use('/api/v1', apiRoutesV1);

// Backward compatibility: /api points to /api/v1
app.use('/api', apiRoutesV1);

// 5. Admin routes (ALL require authentication)
app.use('/admin', adminRoutes);

// 5. Catch-all for static pages (marketing, etc.)
app.get('/', (req, res) => {
  res.render('index', {
    title: 'KYRA AI Guardrail',
    user: req.user || null
  });
});

// ===== ERROR HANDLING =====

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    path: req.path,
    method: req.method
  });
});

// Sentry error handler (MUST be before custom error handler)
app.use(getSentryErrorHandler());

// Error handler
app.use((err, req, res, next) => {
  logger.error('Request error', err, {
    correlationId: req.correlationId,
    method: req.method,
    path: req.path,
    statusCode: err.status || 500,
  });

  // Capture error in error tracking service
  ErrorTrackingService.captureException(err, {
    correlationId: req.correlationId,
    method: req.method,
    path: req.path,
    url: req.originalUrl,
    userId: req.user?.id,
  });

  // CSRF token error
  if (err.code === 'EBADCSRFTOKEN') {
    ErrorTrackingService.captureSecurityEvent('csrf_validation_failed', {
      correlationId: req.correlationId,
    });
    return res.status(403).json({
      success: false,
      error: 'CSRF token validation failed'
    });
  }

  // Generic error response
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ===== DATABASE INITIALIZATION =====

async function initializeDatabase() {
  try {
    await database.testConnection();
    logger.info('✓ Database connection successful');

    if (process.env.NODE_ENV !== 'test') {
      await database.syncDatabase();
      logger.info('✓ Database models synchronized');
    }
  } catch (error) {
    logger.error('✗ Database initialization failed', error);
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
}

// ===== SERVER STARTUP =====

const PORT = process.env.PORT || 3000;
const PROTOCOL = process.env.PROTOCOL || 'http';
const HOSTNAME = process.env.HOSTNAME || 'localhost';

(async () => {
  await initializeDatabase();

  const server = app.listen(PORT, () => {
    const startupMessage = `KYRA Admin Console - Server Started on ${PROTOCOL}://${HOSTNAME}:${PORT}`;
    logger.info(startupMessage, {
      url: `${PROTOCOL}://${HOSTNAME}:${PORT}`,
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
    });

    console.log(`
╔════════════════════════════════════════════════════════════════╗
║  KYRA Admin Console - Server Started                          ║
╠════════════════════════════════════════════════════════════════╣
║  URL:       ${PROTOCOL}://${HOSTNAME}:${PORT}
║  Environment: ${process.env.NODE_ENV || 'development'}
║  Node:      ${process.version}
╚════════════════════════════════════════════════════════════════╝

📖 API Documentation: ${PROTOCOL}://${HOSTNAME}:${PORT}/api/docs
🔐 Login: ${PROTOCOL}://${HOSTNAME}:${PORT}/login
📊 Dashboard: ${PROTOCOL}://${HOSTNAME}:${PORT}/admin/dashboard
❤️  Health: ${PROTOCOL}://${HOSTNAME}:${PORT}/health
    `);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM signal received: closing HTTP server');
    server.close(async () => {
      logger.info('HTTP server closed');
      await ErrorTrackingService.flush(5000);
      process.exit(0);
    });
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT signal received: closing HTTP server');
    server.close(async () => {
      logger.info('HTTP server closed');
      await ErrorTrackingService.flush(5000);
      process.exit(0);
    });
  });
})();

module.exports = app;
