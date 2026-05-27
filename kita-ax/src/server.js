/**
 * KYRA Admin Console - Main Express Application
 * Phase 1: Foundation Implementation
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const swaggerUi = require('swagger-ui-express');
const fs = require('fs');

// Middleware
const sessionMiddleware = require('./config/session');
const {
  cors,
  helmet,
  limiter,
  cookieParser,
  csrfProtection
} = require('./middleware/security');

// Routes
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const apiRoutesV1 = require('./routes/api-v1');

// Load OpenAPI spec
const openApiSpec = JSON.parse(fs.readFileSync(path.join(__dirname, 'docs/openapi.json'), 'utf8'));

// Create Express app
const app = express();

// ===== MIDDLEWARE SETUP (Order matters!) =====

// 1. Trust proxy (for production)
app.set('trust proxy', 1);

// 2. Security middleware
app.use(helmet);
app.use(cors);
app.use(limiter);
app.use(cookieParser);

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

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);

  // CSRF token error
  if (err.code === 'EBADCSRFTOKEN') {
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

// ===== SERVER STARTUP =====

const PORT = process.env.PORT || 3000;
const PROTOCOL = process.env.PROTOCOL || 'http';
const HOSTNAME = process.env.HOSTNAME || 'localhost';

const server = app.listen(PORT, () => {
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
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

module.exports = app;
