# KYRA Console Remediation — Implementation Plan

**Project:** Fix KYRA Admin Console Architecture Issues  
**Start Date:** 2026-05-27  
**Target Completion:** 2026-06-23 (4 weeks)  
**Status:** Ready for Development  
**Priority:** 🔴 CRITICAL

---

## Executive Overview

This plan addresses 13 identified issues across routing, authentication, API design, and security. Work is organized into **4 phases** with clear dependencies and testing gates.

### Timeline Overview:
```
Phase 1: Foundation (Days 1-5)     — Core routing & auth
Phase 2: Admin Console (Days 6-10) — UI shell & navigation
Phase 3: API Layer (Days 11-17)    — RESTful API standardization
Phase 4: Hardening (Days 18-28)    — Security & QA
```

### Success Criteria:
- ✅ All 13 issues resolved
- ✅ Admin console fully functional
- ✅ 100% test coverage on critical paths
- ✅ Zero security vulnerabilities
- ✅ API documented and discoverable
- ✅ Session management tested and verified

---

## Phase 1: Foundation & Core Architecture (Days 1-5)

### 1.1 Fix Admin Route Handling

**Issue:** All `/admin/*` routes serve marketing landing page  
**Component:** Express routing middleware  
**Estimated Time:** 1 day

#### Task 1.1.1 - Audit Current Routing Structure
```bash
# Review current routing
grep -r "app.get\|app.post\|router" src/ | head -20
```

**Deliverable:** Document of all current routes and handlers

#### Task 1.1.2 - Implement Route Precedence
**File:** `src/server.js` or `src/app.js`

```javascript
// BEFORE (broken):
app.use(express.static('public'));
app.get('*', servePublicSite);  // Catch-all too early

// AFTER (fixed):
// 1. Middleware (early)
app.use(express.json());
app.use(express.static('public'));
app.use(sessionMiddleware);

// 2. API routes
app.use('/api/v1', apiRoutes);

// 3. Admin routes (protected)
app.use('/admin', requireAuth);
app.use('/admin', adminRoutes);

// 4. Public routes  
app.get('/login', loginPage);
app.get('/pricing', pricingPage);
app.get('/blog', blogPage);

// 5. Catch-all (last)
app.get('*', servePublicSite);
```

**Acceptance Criteria:**
- [ ] `GET /admin/dashboard` returns admin template (not marketing)
- [ ] `GET /admin/users` returns users template
- [ ] `GET /` still returns marketing page
- [ ] No 404 errors for valid routes

#### Task 1.1.3 - Create Admin Route Handlers

**File:** `src/routes/admin.js`

```javascript
const express = require('express');
const router = express.Router();

// All admin routes require authentication
router.use(requireAuth);

// Dashboard
router.get('/dashboard', async (req, res) => {
  const metrics = await getDashboardMetrics(req.user.id);
  res.render('admin/dashboard', { metrics, user: req.user });
});

// Users Management
router.get('/users', async (req, res) => {
  const users = await getAllUsers(req.user.tenantId);
  res.render('admin/users', { users, user: req.user });
});

router.post('/users', async (req, res) => {
  const newUser = await createUser(req.user.tenantId, req.body);
  res.json({ success: true, user: newUser });
});

// Documents
router.get('/documents', async (req, res) => {
  const docs = await getDocuments(req.user.tenantId);
  res.render('admin/documents', { docs, user: req.user });
});

// Access Policies
router.get('/access-policies', async (req, res) => {
  const policies = await getAccessPolicies(req.user.tenantId);
  res.render('admin/access-policies', { policies, user: req.user });
});

router.put('/access-policies', requireAuth, async (req, res) => {
  const updated = await updateAccessPolicies(req.user.tenantId, req.body);
  res.json({ success: true, policies: updated });
});

// Audit Logs
router.get('/audit-logs', async (req, res) => {
  const logs = await getAuditLogs(req.user.tenantId, {
    limit: req.query.limit || 100,
    offset: req.query.offset || 0,
    filter: req.query.filter
  });
  res.render('admin/audit-logs', { logs, user: req.user });
});

// Settings
router.get('/settings', async (req, res) => {
  const settings = await getAdminSettings(req.user.tenantId);
  res.render('admin/settings', { settings, user: req.user });
});

router.put('/settings', async (req, res) => {
  const updated = await updateAdminSettings(req.user.tenantId, req.body);
  res.json({ success: true, settings: updated });
});

// Agents
router.get('/agents', async (req, res) => {
  const agents = await getAgents(req.user.tenantId);
  res.render('admin/agents', { agents, user: req.user });
});

module.exports = router;
```

**Acceptance Criteria:**
- [ ] All 7 admin routes defined
- [ ] Each route has proper error handling
- [ ] Requires authentication on all routes
- [ ] Returns appropriate data/templates

---

### 1.2 Implement Session Management

**Issue:** Session doesn't persist after login  
**Component:** Express session + Redis store  
**Estimated Time:** 1.5 days

#### Task 1.2.1 - Install Dependencies

```bash
npm install express-session connect-redis redis dotenv
```

#### Task 1.2.2 - Configure Session Middleware

**File:** `src/config/session.js`

```javascript
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const { createClient } = require('redis');

// Create Redis client
const redisClient = createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD
});

redisClient.connect();

module.exports = session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET || 'dev-secret-key-change-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // HTTPS only in prod
    sameSite: 'strict',
    maxAge: 3600000, // 1 hour
    domain: process.env.COOKIE_DOMAIN || 'localhost'
  }
});
```

**Acceptance Criteria:**
- [ ] Session middleware initialized before routes
- [ ] Redis connection verified
- [ ] Session cookies set with `httpOnly` flag
- [ ] `secure` flag set in production

#### Task 1.2.3 - Update Login Handler

**File:** `src/routes/auth.js`

```javascript
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    // Verify credentials
    const user = await User.findByEmail(email);
    if (!user || !await user.verifyPassword(password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Check if user is active
    if (user.status !== 'active') {
      return res.status(403).json({ error: 'User account is inactive' });
    }
    
    // Set session
    req.session.userId = user.id;
    req.session.email = user.email;
    req.session.role = user.role;
    req.session.tenantId = user.tenantId;
    req.session.save((err) => {
      if (err) {
        return res.status(500).json({ error: 'Session creation failed' });
      }
      
      // Redirect to dashboard
      if (req.headers['content-type'] === 'application/json') {
        res.json({ success: true, redirect: '/admin/dashboard' });
      } else {
        res.redirect('/admin/dashboard');
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.redirect('/login');
  });
});
```

**Acceptance Criteria:**
- [ ] Credentials validated before session creation
- [ ] Session ID generated and stored in Redis
- [ ] Redirect to dashboard after successful login
- [ ] Logout clears session

#### Task 1.2.4 - Add Authentication Middleware

**File:** `src/middleware/auth.js`

```javascript
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    // API request
    if (req.headers['content-type'] === 'application/json') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    // Page request
    return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
  }
  
  // Attach user info to request
  req.user = {
    id: req.session.userId,
    email: req.session.email,
    role: req.session.role,
    tenantId: req.session.tenantId
  };
  
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
```

**Acceptance Criteria:**
- [ ] Unauthenticated requests redirected to login
- [ ] Session verified on each request
- [ ] User object attached to request
- [ ] Admin role checking works

#### Task 1.2.5 - Test Session Persistence

**Test Cases:**

```bash
# 1. Login and verify session cookie
curl -c cookies.txt -X POST https://127.0.0.1/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@seekerslab.com","password":"xmUoX0OA5XvSH4csBJbw"}'

# 2. Access protected route with session cookie
curl -b cookies.txt https://127.0.0.1/admin/dashboard

# 3. Verify response is admin page (not marketing)
# Should contain: <h1>Dashboard</h1> or admin content

# 4. Delete cookie and try again
curl https://127.0.0.1/admin/dashboard
# Should redirect to /login
```

**Acceptance Criteria:**
- [ ] Session cookie created after login
- [ ] Cookie sent with subsequent requests
- [ ] Admin dashboard accessible with valid session
- [ ] 401 redirect without session

---

### 1.3 Create Admin Layout/Shell

**Issue:** No admin console UI shell  
**Component:** Template/layout files  
**Estimated Time:** 1.5 days

#### Task 1.3.1 - Create Base Admin Layout

**File:** `src/views/layouts/admin.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{% block title %}KYRA Admin Console{% endblock %}</title>
  <link rel="stylesheet" href="/css/admin.css">
  {% block extra_css %}{% endblock %}
</head>
<body class="admin-layout">
  <!-- Top Navigation Bar -->
  <nav class="admin-navbar">
    <div class="navbar-container">
      <!-- Brand -->
      <div class="navbar-brand">
        <a href="/admin/dashboard" class="logo">
          <span class="logo-text">🔐 KYRA</span>
        </a>
      </div>

      <!-- Main Navigation -->
      <div class="navbar-menu">
        <a href="/admin/dashboard" class="nav-link {% if current_page == 'dashboard' %}active{% endif %}">
          <span class="icon">📊</span> Dashboard
        </a>
        <a href="/admin/documents" class="nav-link {% if current_page == 'documents' %}active{% endif %}">
          <span class="icon">📄</span> Documents
        </a>
        <a href="/admin/access-policies" class="nav-link {% if current_page == 'policies' %}active{% endif %}">
          <span class="icon">🔐</span> Access Policies
        </a>
        <a href="/admin/users" class="nav-link {% if current_page == 'users' %}active{% endif %}">
          <span class="icon">👥</span> Users
        </a>
        <a href="/admin/audit-logs" class="nav-link {% if current_page == 'audit' %}active{% endif %}">
          <span class="icon">📋</span> Audit Logs
        </a>
        <a href="/admin/settings" class="nav-link {% if current_page == 'settings' %}active{% endif %}">
          <span class="icon">⚙️</span> Settings
        </a>
      </div>

      <!-- User Menu (Right) -->
      <div class="navbar-right">
        <div class="user-menu">
          <span class="user-email">{{ user.email }}</span>
          <div class="dropdown-menu">
            <button class="dropdown-toggle">
              <span class="icon">▼</span>
            </button>
            <div class="dropdown-content">
              <a href="/admin/profile" class="dropdown-item">Profile</a>
              <a href="/admin/settings" class="dropdown-item">Settings</a>
              <hr class="dropdown-divider">
              <form method="POST" action="/logout" style="margin: 0;">
                <button type="submit" class="dropdown-item logout-btn">Logout</button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  </nav>

  <!-- Breadcrumb (if applicable) -->
  {% if breadcrumbs %}
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <ol>
      <li><a href="/admin/dashboard">Home</a></li>
      {% for item in breadcrumbs %}
      <li>
        {% if item.url %}<a href="{{ item.url }}">{% endif %}
        {{ item.label }}
        {% if item.url %}</a>{% endif %}
      </li>
      {% endfor %}
    </ol>
  </nav>
  {% endif %}

  <!-- Main Content Area -->
  <main class="admin-main">
    <!-- Page Header -->
    <div class="page-header">
      <div class="page-title-section">
        <h1>{% block page_title %}{% endblock %}</h1>
        {% if page_subtitle %}<p class="page-subtitle">{{ page_subtitle }}</p>{% endif %}
      </div>
      <div class="page-actions">
        {% block page_actions %}{% endblock %}
      </div>
    </div>

    <!-- Alert Messages -->
    {% if success_message %}
    <div class="alert alert-success" role="alert">
      <span class="icon">✓</span> {{ success_message }}
      <button class="alert-close" onclick="this.parentElement.style.display='none';">&times;</button>
    </div>
    {% endif %}

    {% if error_message %}
    <div class="alert alert-error" role="alert">
      <span class="icon">✕</span> {{ error_message }}
      <button class="alert-close" onclick="this.parentElement.style.display='none';">&times;</button>
    </div>
    {% endif %}

    <!-- Page Content -->
    <div class="page-content">
      {% block content %}{% endblock %}
    </div>
  </main>

  <!-- Footer -->
  <footer class="admin-footer">
    <p>&copy; 2026 KYRA Admin Console. 
       <a href="/docs/admin">Documentation</a> | 
       <a href="https://status.kyra-guardrail-dev.seekerslab.com">Status</a>
    </p>
  </footer>

  <!-- JavaScript -->
  <script src="/js/admin.js"></script>
  {% block extra_js %}{% endblock %}
</body>
</html>
```

#### Task 1.3.2 - Create Admin CSS

**File:** `src/public/css/admin.css`

```css
/* Admin Layout Styles */

:root {
  --primary-color: #2e8b57;
  --primary-dark: #1a1a40;
  --secondary-color: #f0f2f5;
  --text-primary: #1a1a40;
  --text-secondary: #666;
  --border-color: #ddd;
  --success-color: #2e7d32;
  --error-color: #d32f2f;
  --navbar-height: 60px;
}

/* Layout Structure */
.admin-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: #f5f7fa;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  margin: 0;
  padding: 0;
}

/* Navigation Bar */
.admin-navbar {
  position: sticky;
  top: 0;
  z-index: 1000;
  background: linear-gradient(90deg, var(--primary-dark) 0%, var(--primary-color) 100%);
  color: white;
  padding: 0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  height: var(--navbar-height);
}

.navbar-container {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  padding: 0 20px;
  max-width: 1400px;
  margin: 0 auto;
}

.navbar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo {
  text-decoration: none;
  color: white;
  font-size: 18px;
  font-weight: 600;
  display: flex;
  align-items: center;
}

.navbar-menu {
  display: flex;
  gap: 20px;
  flex: 1;
  margin-left: 40px;
}

.nav-link {
  color: rgba(255,255,255,0.8);
  text-decoration: none;
  padding: 8px 12px;
  border-radius: 4px;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.nav-link:hover {
  color: white;
  background: rgba(255,255,255,0.1);
}

.nav-link.active {
  color: white;
  background: rgba(255,255,255,0.2);
  font-weight: 600;
}

.navbar-right {
  display: flex;
  align-items: center;
  gap: 20px;
}

.user-menu {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
}

.user-email {
  font-size: 13px;
}

.dropdown-toggle {
  background: none;
  border: none;
  color: white;
  cursor: pointer;
  padding: 4px 8px;
}

.dropdown-content {
  position: absolute;
  top: 100%;
  right: 0;
  background: white;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  min-width: 180px;
  display: none;
  z-index: 1001;
  margin-top: 8px;
}

.user-menu:hover .dropdown-content {
  display: block;
}

.dropdown-item {
  display: block;
  width: 100%;
  padding: 12px 16px;
  background: none;
  border: none;
  text-align: left;
  color: var(--text-primary);
  cursor: pointer;
  text-decoration: none;
  font-size: 14px;
  transition: background 0.2s;
}

.dropdown-item:hover {
  background: var(--secondary-color);
}

.logout-btn {
  color: var(--error-color);
  font-weight: 600;
}

.dropdown-divider {
  margin: 4px 0;
  border: none;
  border-top: 1px solid var(--border-color);
}

/* Main Content */
.admin-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 30px;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
}

/* Page Header */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 30px;
}

.page-title-section h1 {
  margin: 0 0 8px 0;
  color: var(--text-primary);
  font-size: 28px;
  font-weight: 600;
}

.page-subtitle {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.page-actions {
  display: flex;
  gap: 12px;
}

/* Page Content */
.page-content {
  background: white;
  border-radius: 8px;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}

/* Alerts */
.alert {
  padding: 12px 16px;
  border-radius: 4px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
}

.alert-success {
  background: #e8f5e9;
  color: var(--success-color);
  border-left: 4px solid var(--success-color);
}

.alert-error {
  background: #ffebee;
  color: var(--error-color);
  border-left: 4px solid var(--error-color);
}

.alert-close {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 18px;
  padding: 0;
}

/* Breadcrumb */
.breadcrumb {
  padding: 12px 0;
  margin-bottom: 20px;
  font-size: 13px;
}

.breadcrumb ol {
  display: flex;
  gap: 8px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.breadcrumb li {
  display: flex;
  align-items: center;
}

.breadcrumb li:not(:last-child)::after {
  content: '/';
  margin: 0 8px;
  color: var(--text-secondary);
}

.breadcrumb a {
  color: var(--primary-color);
  text-decoration: none;
}

.breadcrumb a:hover {
  text-decoration: underline;
}

/* Footer */
.admin-footer {
  background: var(--secondary-color);
  padding: 20px;
  text-align: center;
  border-top: 1px solid var(--border-color);
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: auto;
}

.admin-footer a {
  color: var(--primary-color);
  text-decoration: none;
}

.admin-footer a:hover {
  text-decoration: underline;
}

/* Responsive */
@media (max-width: 768px) {
  .navbar-menu {
    display: none;
  }
  
  .page-header {
    flex-direction: column;
    gap: 16px;
  }
  
  .admin-main {
    padding: 16px;
  }
  
  .page-content {
    padding: 16px;
  }
}
```

**Acceptance Criteria:**
- [ ] Admin layout renders without errors
- [ ] Navigation menu visible and clickable
- [ ] User menu dropdown works
- [ ] Breadcrumbs display correctly
- [ ] Mobile responsive
- [ ] Alert messages display properly

---

## Phase 2: Admin Console Implementation (Days 6-10)

### 2.1 Create Admin Page Templates

**Estimated Time:** 2.5 days

#### Task 2.1.1 - Dashboard Page

**File:** `src/views/admin/dashboard.html`

```html
{% extends "layouts/admin.html" %}

{% block title %}Dashboard - KYRA Admin Console{% endblock %}
{% block page_title %}Dashboard{% endblock %}

{% block content %}
<div class="dashboard-grid">
  <!-- KPI Cards -->
  <div class="kpi-section">
    <div class="kpi-card">
      <div class="kpi-label">Total Documents</div>
      <div class="kpi-value">{{ metrics.totalDocuments }}</div>
      <div class="kpi-change positive">↑ {{ metrics.docsThisMonth }}</div>
    </div>
    
    <div class="kpi-card">
      <div class="kpi-label">Active Users</div>
      <div class="kpi-value">{{ metrics.activeUsers }}</div>
      <div class="kpi-change">Last 24h</div>
    </div>
    
    <div class="kpi-card">
      <div class="kpi-label">Access Policies</div>
      <div class="kpi-value">{{ metrics.totalPolicies }}</div>
      <div class="kpi-change">Configured</div>
    </div>
    
    <div class="kpi-card alert">
      <div class="kpi-label">Audit Events</div>
      <div class="kpi-value">{{ metrics.auditEvents }}</div>
      <div class="kpi-change">Last 7 days</div>
    </div>
  </div>

  <!-- Charts Section -->
  <div class="charts-section">
    <div class="chart-container">
      <h3>Access Patterns (24h)</h3>
      <div id="access-chart" class="chart"></div>
    </div>
    
    <div class="chart-container">
      <h3>Document Classification</h3>
      <div id="classification-chart" class="chart"></div>
    </div>
  </div>

  <!-- Recent Activity -->
  <div class="activity-section">
    <h3>Recent Audit Events</h3>
    <table class="activity-table">
      <thead>
        <tr>
          <th>Time</th>
          <th>User</th>
          <th>Action</th>
          <th>Resource</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {% for event in metrics.recentEvents %}
        <tr>
          <td>{{ event.timestamp }}</td>
          <td>{{ event.user.email }}</td>
          <td>{{ event.action }}</td>
          <td>{{ event.resource }}</td>
          <td><span class="badge badge-{{ event.status }}">{{ event.status }}</span></td>
        </tr>
        {% endfor %}
      </tbody>
    </table>
  </div>
</div>
{% endblock %}

{% block extra_js %}
<script src="/js/charts.js"></script>
<script>
  // Initialize charts
  initializeAccessChart('#access-chart');
  initializeClassificationChart('#classification-chart');
</script>
{% endblock %}
```

#### Task 2.1.2 - Users Management Page

**File:** `src/views/admin/users.html`

```html
{% extends "layouts/admin.html" %}

{% block title %}Users - KYRA Admin Console{% endblock %}
{% block page_title %}User Management{% endblock %}

{% block page_actions %}
<button class="btn btn-primary" onclick="openNewUserModal()">+ Add User</button>
{% endblock %}

{% block content %}
<!-- Filters -->
<div class="filters-section">
  <input type="text" id="search-users" placeholder="Search by email or name..." class="search-input">
  <select id="role-filter" class="filter-select">
    <option value="">All Roles</option>
    <option value="admin">Admin</option>
    <option value="manager">Manager</option>
    <option value="user">User</option>
    <option value="viewer">Viewer</option>
  </select>
  <select id="status-filter" class="filter-select">
    <option value="">All Status</option>
    <option value="active">Active</option>
    <option value="inactive">Inactive</option>
  </select>
</div>

<!-- Users Table -->
<table class="data-table">
  <thead>
    <tr>
      <th>Email</th>
      <th>Name</th>
      <th>Role</th>
      <th>Status</th>
      <th>Last Login</th>
      <th>Actions</th>
    </tr>
  </thead>
  <tbody>
    {% for user in users %}
    <tr>
      <td>{{ user.email }}</td>
      <td>{{ user.name }}</td>
      <td><span class="badge badge-role">{{ user.role }}</span></td>
      <td><span class="badge badge-{{ user.status }}">{{ user.status }}</span></td>
      <td>{{ user.lastLogin | formatDate }}</td>
      <td class="actions-cell">
        <button class="action-btn" onclick="editUser('{{ user.id }}')">Edit</button>
        <button class="action-btn danger" onclick="deleteUser('{{ user.id }}')">Delete</button>
      </td>
    </tr>
    {% endfor %}
  </tbody>
</table>

<!-- Pagination -->
<div class="pagination">
  <button onclick="previousPage()" {{ 'disabled' if page == 1 else '' }}>← Previous</button>
  <span>Page {{ page }} of {{ totalPages }}</span>
  <button onclick="nextPage()" {{ 'disabled' if page == totalPages else '' }}>Next →</button>
</div>

<!-- New/Edit User Modal -->
<div id="user-modal" class="modal">
  <div class="modal-content">
    <h2>{{ modalTitle }}</h2>
    <form id="user-form" onsubmit="saveUser(event)">
      <div class="form-group">
        <label>Email *</label>
        <input type="email" name="email" required>
      </div>
      <div class="form-group">
        <label>Name</label>
        <input type="text" name="name">
      </div>
      <div class="form-group">
        <label>Role *</label>
        <select name="role" required>
          <option value="viewer">Viewer</option>
          <option value="user">User</option>
          <option value="manager">Manager</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <div class="form-group">
        <label>Status *</label>
        <select name="status" required>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">Save User</button>
        <button type="button" class="btn btn-secondary" onclick="closeUserModal()">Cancel</button>
      </div>
    </form>
  </div>
</div>
{% endblock %}

{% block extra_js %}
<script src="/js/users.js"></script>
{% endblock %}
```

#### Task 2.1.3 - Access Policies Page

**File:** `src/views/admin/access-policies.html`

```html
{% extends "layouts/admin.html" %}

{% block title %}Access Policies - KYRA Admin Console{% endblock %}
{% block page_title %}Access Policies — Role × Classification Matrix{% endblock %}

{% block content %}
<div class="policies-container">
  <div class="policies-info">
    <p>Configure role-based access control for document classifications.</p>
  </div>

  <!-- Policy Matrix -->
  <table class="policy-matrix">
    <thead>
      <tr>
        <th>Role / Classification</th>
        <th class="classification">Public</th>
        <th class="classification">Internal</th>
        <th class="classification">Confidential</th>
        <th class="classification">Restricted</th>
      </tr>
    </thead>
    <tbody>
      {% for role in roles %}
      <tr>
        <td class="role-name">{{ role.name }}</td>
        {% for classification in classifications %}
        <td class="policy-cell">
          <input type="checkbox" 
                 class="policy-checkbox"
                 data-role="{{ role.id }}"
                 data-classification="{{ classification.id }}"
                 {% if policies[role.id][classification.id] %}checked{% endif %}
                 onchange="updatePolicy(this)">
          <span class="checkmark"></span>
        </td>
        {% endfor %}
      </tr>
      {% endfor %}
    </tbody>
  </table>

  <!-- Policy Info -->
  <div class="policy-info-section">
    <h3>Policy Definitions</h3>
    <ul>
      <li><strong>Public:</strong> Accessible to all users</li>
      <li><strong>Internal:</strong> Accessible to internal employees</li>
      <li><strong>Confidential:</strong> Restricted to management and authorized users</li>
      <li><strong>Restricted:</strong> Available only to administrators</li>
    </ul>
  </div>

  <!-- Actions -->
  <div class="policy-actions">
    <button class="btn btn-primary" onclick="savePolicies()">Save Policies</button>
    <button class="btn btn-secondary" onclick="resetPolicies()">Reset</button>
  </div>
</div>
{% endblock %}

{% block extra_js %}
<script src="/js/policies.js"></script>
{% endblock %}
```

#### Task 2.1.4 - Audit Logs Page

**File:** `src/views/admin/audit-logs.html`

```html
{% extends "layouts/admin.html" %}

{% block title %}Audit Logs - KYRA Admin Console{% endblock %}
{% block page_title %}Audit Logs — Access & Change History{% endblock %}

{% block content %}
<!-- Filters -->
<div class="audit-filters">
  <input type="text" id="search-logs" placeholder="Search audit logs..." class="search-input">
  
  <select id="action-filter" class="filter-select">
    <option value="">All Actions</option>
    <option value="read">Read</option>
    <option value="create">Create</option>
    <option value="update">Update</option>
    <option value="delete">Delete</option>
  </select>
  
  <select id="user-filter" class="filter-select">
    <option value="">All Users</option>
    {% for user in users %}
    <option value="{{ user.id }}">{{ user.email }}</option>
    {% endfor %}
  </select>
  
  <input type="date" id="date-from" class="filter-select">
  <input type="date" id="date-to" class="filter-select">
  
  <button class="btn btn-secondary" onclick="applyFilters()">Filter</button>
  <button class="btn btn-secondary" onclick="clearFilters()">Clear</button>
</div>

<!-- Audit Table -->
<table class="audit-table">
  <thead>
    <tr>
      <th>Timestamp</th>
      <th>User</th>
      <th>Action</th>
      <th>Resource</th>
      <th>Details</th>
      <th>Status</th>
    </tr>
  </thead>
  <tbody>
    {% for log in logs %}
    <tr>
      <td>{{ log.timestamp | formatDateTime }}</td>
      <td>{{ log.user.email }}</td>
      <td><span class="badge badge-action badge-{{ log.action }}">{{ log.action }}</span></td>
      <td>{{ log.resource }}</td>
      <td>{{ log.details }}</td>
      <td><span class="badge badge-{{ log.status }}">{{ log.status }}</span></td>
    </tr>
    {% endfor %}
  </tbody>
</table>

<!-- Pagination -->
<div class="pagination">
  <button onclick="previousAuditPage()" {{ 'disabled' if page == 1 else '' }}>← Previous</button>
  <span>Page {{ page }} of {{ totalPages }}</span>
  <button onclick="nextAuditPage()" {{ 'disabled' if page == totalPages else '' }}>Next →</button>
</div>

<!-- Export -->
<div class="audit-actions">
  <button class="btn btn-secondary" onclick="exportAuditLogs('csv')">Export CSV</button>
  <button class="btn btn-secondary" onclick="exportAuditLogs('json')">Export JSON</button>
</div>
{% endblock %}

{% block extra_js %}
<script src="/js/audit-logs.js"></script>
{% endblock %}
```

**Acceptance Criteria:**
- [ ] All 4 admin pages render correctly
- [ ] Page navigation works
- [ ] Forms submit without errors
- [ ] Data displays in tables correctly
- [ ] Pagination works
- [ ] Modal dialogs open/close

---

### 2.2 Implement Admin API Endpoints

**Estimated Time:** 2.5 days

#### Task 2.2.1 - Create API Routes File

**File:** `src/routes/api/admin.js`

```javascript
const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../../middleware/auth');

// All admin API endpoints require authentication
router.use(requireAuth);

// ===== DASHBOARD =====
router.get('/dashboard', async (req, res) => {
  try {
    const metrics = await getDashboardMetrics(req.user.tenantId);
    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== USERS API =====
router.get('/users', async (req, res) => {
  try {
    const { limit = 50, offset = 0, role, status } = req.query;
    const users = await User.find({
      tenantId: req.user.tenantId,
      ...(role && { role }),
      ...(status && { status })
    })
    .limit(parseInt(limit))
    .skip(parseInt(offset));
    
    const total = await User.countDocuments({
      tenantId: req.user.tenantId,
      ...(role && { role }),
      ...(status && { status })
    });
    
    res.json({
      success: true,
      data: users,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/users', requireAdmin, async (req, res) => {
  try {
    const { email, name, role, status } = req.body;
    
    // Validate
    if (!email || !role) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email and role are required' 
      });
    }
    
    // Check if user exists
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ 
        success: false, 
        error: 'User already exists' 
      });
    }
    
    // Create user
    const user = new User({
      email,
      name,
      role,
      status: status || 'active',
      tenantId: req.user.tenantId
    });
    
    await user.save();
    
    res.status(201).json({
      success: true,
      data: user
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/users/:userId', requireAdmin, async (req, res) => {
  try {
    const { name, role, status } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { name, role, status },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }
    
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/users/:userId', requireAdmin, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.userId);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }
    
    res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== DOCUMENTS API =====
router.get('/documents', async (req, res) => {
  try {
    const { limit = 50, offset = 0, classification } = req.query;
    const docs = await Document.find({
      tenantId: req.user.tenantId,
      ...(classification && { classification })
    })
    .limit(parseInt(limit))
    .skip(parseInt(offset));
    
    const total = await Document.countDocuments({
      tenantId: req.user.tenantId,
      ...(classification && { classification })
    });
    
    res.json({
      success: true,
      data: docs,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== ACCESS POLICIES API =====
router.get('/access-policies', async (req, res) => {
  try {
    const policies = await AccessPolicy.findByTenant(req.user.tenantId);
    res.json({ success: true, data: policies });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/access-policies', requireAdmin, async (req, res) => {
  try {
    const { policies } = req.body;
    
    if (!Array.isArray(policies)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Policies must be an array' 
      });
    }
    
    // Update policies (batch operation)
    const updated = await AccessPolicy.updatePolicies(
      req.user.tenantId,
      policies
    );
    
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== AUDIT LOGS API =====
router.get('/audit-logs', async (req, res) => {
  try {
    const { 
      limit = 100, 
      offset = 0, 
      action, 
      user_id, 
      date_from, 
      date_to 
    } = req.query;
    
    const query = { tenantId: req.user.tenantId };
    if (action) query.action = action;
    if (user_id) query.userId = user_id;
    
    if (date_from || date_to) {
      query.timestamp = {};
      if (date_from) query.timestamp.$gte = new Date(date_from);
      if (date_to) query.timestamp.$lte = new Date(date_to);
    }
    
    const logs = await AuditLog.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset));
    
    const total = await AuditLog.countDocuments(query);
    
    res.json({
      success: true,
      data: logs,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== SETTINGS API =====
router.get('/settings', async (req, res) => {
  try {
    const settings = await AdminSettings.findByTenant(req.user.tenantId);
    res.json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/settings', requireAdmin, async (req, res) => {
  try {
    const settings = await AdminSettings.updateByTenant(
      req.user.tenantId,
      req.body
    );
    res.json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== AGENTS API =====
router.get('/agents', async (req, res) => {
  try {
    const agents = await Agent.find({ tenantId: req.user.tenantId });
    res.json({ success: true, data: agents });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
```

#### Task 2.2.2 - Register API Routes in App

**File:** `src/server.js`

```javascript
const adminApiRoutes = require('./routes/api/admin');

// ... other middleware ...

// API routes
app.use('/api/v1/admin', adminApiRoutes);

// ... rest of app ...
```

**Acceptance Criteria:**
- [ ] All endpoints respond with JSON
- [ ] Pagination works correctly
- [ ] Filtering parameters work
- [ ] Authentication required for all endpoints
- [ ] Admin-only endpoints check role
- [ ] Error responses include proper status codes

---

## Phase 3: API Standardization & Documentation (Days 11-17)

### 3.1 Create OpenAPI Specification

**Estimated Time:** 2 days

**File:** `docs/api/openapi.yaml`

```yaml
openapi: 3.0.0
info:
  title: KYRA Admin API
  version: 1.0.0
  description: REST API for KYRA AI Guardrail admin console
  contact:
    name: KYRA Support
    email: support@seekerslab.com

servers:
  - url: https://kyra-guardrail-dev.seekerslab.com/api/v1
    description: Development server
  - url: https://kyra-guardrail.seekerslab.com/api/v1
    description: Production server

components:
  securitySchemes:
    sessionAuth:
      type: apiKey
      in: cookie
      name: sessionId
      description: Session cookie from /login

  schemas:
    User:
      type: object
      properties:
        id:
          type: string
        email:
          type: string
          format: email
        name:
          type: string
        role:
          type: string
          enum: [admin, manager, user, viewer]
        status:
          type: string
          enum: [active, inactive]
        tenantId:
          type: string
        lastLogin:
          type: string
          format: date-time
        createdAt:
          type: string
          format: date-time

    Document:
      type: object
      properties:
        id:
          type: string
        title:
          type: string
        classification:
          type: string
          enum: [public, internal, confidential, restricted]
        owner:
          type: string
        createdAt:
          type: string
          format: date-time
        updatedAt:
          type: string
          format: date-time

    AccessPolicy:
      type: object
      properties:
        id:
          type: string
        role:
          type: string
        classification:
          type: string
        permitted:
          type: boolean

    AuditLog:
      type: object
      properties:
        id:
          type: string
        timestamp:
          type: string
          format: date-time
        userId:
          type: string
        action:
          type: string
          enum: [read, create, update, delete]
        resource:
          type: string
        details:
          type: string
        status:
          type: string
          enum: [success, denied]

    Error:
      type: object
      properties:
        success:
          type: boolean
        error:
          type: string

security:
  - sessionAuth: []

paths:
  /admin/dashboard:
    get:
      summary: Get dashboard metrics
      tags: [Dashboard]
      responses:
        200:
          description: Dashboard metrics
          content:
            application/json:
              schema:
                type: object
                properties:
                  success:
                    type: boolean
                  data:
                    type: object
        401:
          description: Unauthorized
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /admin/users:
    get:
      summary: List users
      tags: [Users]
      parameters:
        - name: limit
          in: query
          schema:
            type: integer
            default: 50
        - name: offset
          in: query
          schema:
            type: integer
            default: 0
        - name: role
          in: query
          schema:
            type: string
        - name: status
          in: query
          schema:
            type: string
      responses:
        200:
          description: User list
          content:
            application/json:
              schema:
                type: object
                properties:
                  success:
                    type: boolean
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/User'
                  pagination:
                    type: object
        401:
          description: Unauthorized

    post:
      summary: Create new user
      tags: [Users]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [email, role]
              properties:
                email:
                  type: string
                  format: email
                name:
                  type: string
                role:
                  type: string
                  enum: [admin, manager, user, viewer]
                status:
                  type: string
                  enum: [active, inactive]
      responses:
        201:
          description: User created
        400:
          description: Invalid request
        403:
          description: Forbidden (admin required)

  /admin/users/{userId}:
    patch:
      summary: Update user
      tags: [Users]
      parameters:
        - name: userId
          in: path
          required: true
          schema:
            type: string
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                name:
                  type: string
                role:
                  type: string
                status:
                  type: string
      responses:
        200:
          description: User updated

    delete:
      summary: Delete user
      tags: [Users]
      parameters:
        - name: userId
          in: path
          required: true
          schema:
            type: string
      responses:
        200:
          description: User deleted

  /admin/documents:
    get:
      summary: List documents
      tags: [Documents]
      parameters:
        - name: limit
          in: query
          schema:
            type: integer
        - name: offset
          in: query
          schema:
            type: integer
        - name: classification
          in: query
          schema:
            type: string
      responses:
        200:
          description: Document list

  /admin/access-policies:
    get:
      summary: Get access policies
      tags: [Access Policies]
      responses:
        200:
          description: Access policies matrix

    put:
      summary: Update access policies
      tags: [Access Policies]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                policies:
                  type: array
                  items:
                    $ref: '#/components/schemas/AccessPolicy'
      responses:
        200:
          description: Policies updated

  /admin/audit-logs:
    get:
      summary: Get audit logs
      tags: [Audit]
      parameters:
        - name: limit
          in: query
          schema:
            type: integer
        - name: offset
          in: query
          schema:
            type: integer
        - name: action
          in: query
          schema:
            type: string
        - name: user_id
          in: query
          schema:
            type: string
        - name: date_from
          in: query
          schema:
            type: string
            format: date
        - name: date_to
          in: query
          schema:
            type: string
            format: date
      responses:
        200:
          description: Audit logs

  /admin/settings:
    get:
      summary: Get admin settings
      tags: [Settings]
      responses:
        200:
          description: Admin settings

    put:
      summary: Update admin settings
      tags: [Settings]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
      responses:
        200:
          description: Settings updated

  /admin/agents:
    get:
      summary: List agents
      tags: [Agents]
      responses:
        200:
          description: Agent list
```

### 3.2 Set Up Swagger UI

**File:** `src/server.js`

```javascript
const swaggerUi = require('swagger-ui-express');
const yaml = require('js-yaml');
const fs = require('fs');

const openapiSpec = yaml.load(
  fs.readFileSync('./docs/api/openapi.yaml', 'utf8')
);

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));
```

**Acceptance Criteria:**
- [ ] Swagger UI accessible at `/api/docs`
- [ ] All endpoints documented
- [ ] Request/response schemas correct
- [ ] Examples provided
- [ ] Can test endpoints from Swagger UI

---

## Phase 4: Security & QA (Days 18-28)

### 4.1 Implement Security Features

**Estimated Time:** 2 days

#### Task 4.1.1 - Add CSRF Protection

**File:** `src/middleware/csrf.js`

```javascript
const csrf = require('csurf');
const cookieParser = require('cookie-parser');

module.exports = [
  cookieParser(),
  csrf({ cookie: false })
];
```

**Usage:**
```javascript
app.use(csrfMiddleware);

// Add token to forms
app.get('/admin/users', (req, res) => {
  res.render('admin/users', { csrfToken: req.csrfToken() });
});

// Protect POST requests
app.post('/admin/users', csrf, (req, res) => {
  // CSRF token validated by middleware
});
```

#### Task 4.1.2 - Add CORS Headers

**File:** `src/config/cors.js`

```javascript
const cors = require('cors');

module.exports = cors({
  origin: process.env.CORS_ORIGINS?.split(',') || [
    'https://kyra-guardrail-dev.seekerslab.com',
    'https://kyra-guardrail.seekerslab.com'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  exposedHeaders: ['X-Total-Count'],
  maxAge: 3600
});
```

#### Task 4.1.3 - Add Rate Limiting

**File:** `src/middleware/rateLimit.js`

```javascript
const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const { createClient } = require('redis');

const redisClient = createClient();

const limiter = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: 'rl:'
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests, please try again later'
});

module.exports = limiter;
```

**Usage:**
```javascript
app.use(limiter);  // Apply to all routes
app.post('/login', strictLimiter, loginHandler);  // Stricter for login
```

#### Task 4.1.4 - Add Security Headers

**File:** `src/middleware/securityHeaders.js`

```javascript
const helmet = require('helmet');

module.exports = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https:']
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
});
```

### 4.2 Testing & Validation

**Estimated Time:** 3 days

#### Task 4.2.1 - Unit Tests

**File:** `tests/unit/auth.test.js`

```javascript
const request = require('supertest');
const app = require('../../src/server');
const User = require('../../src/models/User');

describe('Authentication', () => {
  beforeEach(async () => {
    await User.deleteMany({});
  });

  test('Should login with valid credentials', async () => {
    const user = await User.create({
      email: 'test@example.com',
      password: 'password123'
    });

    const res = await request(app)
      .post('/login')
      .send({
        email: 'test@example.com',
        password: 'password123'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('Should reject invalid credentials', async () => {
    const res = await request(app)
      .post('/login')
      .send({
        email: 'test@example.com',
        password: 'wrongpassword'
      });

    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  test('Should require auth for admin routes', async () => {
    const res = await request(app)
      .get('/admin/dashboard');

    expect(res.status).toBe(401);
  });
});
```

#### Task 4.2.2 - Integration Tests

**File:** `tests/integration/admin-flow.test.js`

```javascript
describe('Admin Console Flow', () => {
  test('Complete user management flow', async () => {
    // 1. Login
    const loginRes = await request(app)
      .post('/login')
      .send({
        email: 'admin@example.com',
        password: 'password123'
      });

    const cookies = loginRes.headers['set-cookie'];

    // 2. Create user
    const createRes = await request(app)
      .post('/api/v1/admin/users')
      .set('Cookie', cookies)
      .send({
        email: 'newuser@example.com',
        role: 'user'
      });

    expect(createRes.status).toBe(201);

    // 3. List users
    const listRes = await request(app)
      .get('/api/v1/admin/users')
      .set('Cookie', cookies);

    expect(listRes.body.data.length).toBeGreaterThan(0);

    // 4. Update user
    const updateRes = await request(app)
      .patch(`/api/v1/admin/users/${createRes.body.data.id}`)
      .set('Cookie', cookies)
      .send({ role: 'manager' });

    expect(updateRes.status).toBe(200);

    // 5. Delete user
    const deleteRes = await request(app)
      .delete(`/api/v1/admin/users/${createRes.body.data.id}`)
      .set('Cookie', cookies);

    expect(deleteRes.status).toBe(200);
  });
});
```

#### Task 4.2.3 - E2E Tests with Playwright

**File:** `tests/e2e/admin-console.spec.js`

```javascript
const { test, expect } = require('@playwright/test');

test.describe('Admin Console', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('https://127.0.0.1/login');
    await page.fill('input[name="email"]', 'admin@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForNavigation();
  });

  test('Should display dashboard', async ({ page }) => {
    await page.goto('https://127.0.0.1/admin/dashboard');
    const title = await page.locator('h1');
    await expect(title).toContainText('Dashboard');
  });

  test('Should manage users', async ({ page }) => {
    await page.goto('https://127.0.0.1/admin/users');
    
    // Add user
    await page.click('button:has-text("Add User")');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.selectOption('select[name="role"]', 'user');
    await page.click('button:has-text("Save User")');
    
    // Verify user in table
    const table = await page.locator('table tbody');
    const text = await table.textContent();
    expect(text).toContain('test@example.com');
  });

  test('Should configure access policies', async ({ page }) => {
    await page.goto('https://127.0.0.1/admin/access-policies');
    
    // Check a policy checkbox
    const checkbox = page.locator('input[type="checkbox"]').first();
    await checkbox.check();
    
    // Save policies
    await page.click('button:has-text("Save Policies")');
    
    // Verify success
    const alert = await page.locator('.alert-success');
    await expect(alert).toBeVisible();
  });
});
```

**Acceptance Criteria:**
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] All E2E tests pass
- [ ] 80%+ code coverage
- [ ] No security warnings
- [ ] Performance benchmarks met

---

## Project Timeline & Milestones

### Week 1: Foundation (May 27 - May 31)
- **Day 1-2:** Fix routing, implement auth middleware
- **Day 3:** Session management with Redis
- **Day 4-5:** Admin layout & basic pages
- **Milestone 1:** Admin routes serve correct pages ✓

### Week 2: Console & API (June 3 - June 7)
- **Day 6:** Complete admin page templates
- **Day 7-8:** Admin API endpoints
- **Day 9:** API documentation (OpenAPI)
- **Day 10:** Swagger UI setup
- **Milestone 2:** Admin console fully functional ✓

### Week 3: API & Security (June 10 - June 14)
- **Day 11-13:** Complete API standardization
- **Day 14-15:** Security hardening (CSRF, CORS, headers)
- **Day 16-17:** Rate limiting & logging
- **Milestone 3:** Secure, documented API ✓

### Week 4: Testing & Hardening (June 17 - June 23)
- **Day 18-20:** Unit & integration tests
- **Day 21-22:** E2E tests & performance testing
- **Day 23:** Bug fixes & final QA
- **Milestone 4:** Ready for production ✓

---

## Resource Allocation

| Role | Estimated Hours | Allocation |
|------|-----------------|-----------|
| Backend Developer | 80 | Days 1-23 (main) |
| Frontend Developer | 40 | Days 5-10 (UI/UX) |
| QA Engineer | 30 | Days 18-23 (testing) |
| DevOps | 10 | Days 1, 10-17 (infra) |
| **Total** | **160** | 4 weeks |

---

## Risk Mitigation

### Risk 1: Session Management Complexity
**Mitigation:** Use well-tested Redis store library, comprehensive testing

### Risk 2: API Design Changes
**Mitigation:** Document API early, version endpoints, review design before coding

### Risk 3: Security Vulnerabilities
**Mitigation:** Security code review, OWASP testing, penetration testing scheduled

### Risk 4: Performance Degradation
**Mitigation:** Load testing, query optimization, caching strategy

### Risk 5: Breaking Existing Functionality
**Mitigation:** Comprehensive E2E tests, staging environment validation

---

## Success Metrics

✅ **Functional:**
- All 13 issues resolved
- Admin console fully functional
- API documented and discoverable
- All routes respond correctly

✅ **Quality:**
- 80%+ code coverage
- Zero P1/P2 security issues
- 100ms < page load time
- 99%+ uptime in staging

✅ **Security:**
- CSRF protection enabled
- CORS properly configured
- Security headers set
- Rate limiting active
- No XSS vulnerabilities

✅ **Documentation:**
- OpenAPI spec complete
- Admin guide written
- API examples provided
- Deployment guide ready

---

## Handoff Checklist

Before moving to production:

- [ ] All tests passing
- [ ] Security audit complete
- [ ] Performance testing done
- [ ] Documentation finalized
- [ ] Stakeholder sign-off
- [ ] Deployment runbook ready
- [ ] Monitoring configured
- [ ] Rollback plan in place

---

## Next Steps

1. **Immediately:** Set up development environment with all dependencies
2. **Day 1:** Begin Phase 1 implementation (routing fixes)
3. **Day 5:** Review progress with stakeholders
4. **Day 10:** Admin console demo to team
5. **Day 17:** Security audit with external firm
6. **Day 23:** Production deployment

---

**Plan Owner:** Engineering Lead  
**Last Updated:** 2026-05-27  
**Status:** Ready for Execution  
**Approval:** Pending PM/Tech Lead Sign-off

