import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Phase 6 Static Analysis Tests
 * Tests file existence and structure without running the server
 */

const VIEWS_DIR = path.join(__dirname, '../src/views/admin');
const ROUTES_FILE = path.join(__dirname, '../src/routes/admin.js');
const HEADER_FILE = path.join(__dirname, '../src/views/layouts/admin-header.ejs');

test.describe('Phase 6: File Structure Verification', () => {
  test('all 10 form views should exist', () => {
    const formViews = [
      'users-new.ejs',
      'users-edit.ejs',
      'documents-new.ejs',
      'documents-edit.ejs',
      'roles-new.ejs',
      'roles-edit.ejs',
      'policies-new.ejs',
      'policies-edit.ejs',
      'agents-new.ejs',
      'agents-edit.ejs'
    ];

    for (const view of formViews) {
      const filePath = path.join(VIEWS_DIR, view);
      expect(fs.existsSync(filePath)).toBeTruthy();
    }
  });

  test('all 6 list views should exist', () => {
    const listViews = [
      'users.ejs',
      'documents.ejs',
      'access-policies.ejs',
      'audit-logs.ejs',
      'agents.ejs',
      'dashboard.ejs'
    ];

    for (const view of listViews) {
      const filePath = path.join(VIEWS_DIR, view);
      expect(fs.existsSync(filePath)).toBeTruthy();
    }
  });

  test('admin.js should have 37+ routes', () => {
    const content = fs.readFileSync(ROUTES_FILE, 'utf-8');
    const getRoutes = (content.match(/router\.get\(/g) || []).length;
    const postRoutes = (content.match(/router\.post\(/g) || []).length;

    expect(getRoutes + postRoutes).toBeGreaterThanOrEqual(37);
  });

  test('admin-header.ejs should have all 7 nav links', () => {
    const content = fs.readFileSync(HEADER_FILE, 'utf-8');

    expect(content).toContain('/admin/dashboard');
    expect(content).toContain('/admin/users');
    expect(content).toContain('/admin/documents');
    expect(content).toContain('/admin/access-policies');
    expect(content).toContain('/admin/agents');
    expect(content).toContain('/admin/audit-logs');
    expect(content).toContain('/admin/settings');
  });
});

test.describe('Phase 6: Form View Structure', () => {
  test('users-new.ejs should have email, password, role, status fields', () => {
    const content = fs.readFileSync(path.join(VIEWS_DIR, 'users-new.ejs'), 'utf-8');

    expect(content).toContain('name="email"');
    expect(content).toContain('name="password"');
    expect(content).toContain('name="role"');
    expect(content).toContain('name="status"');
    expect(content).toContain('method="POST"');
    expect(content).toContain('action="/admin/users"');
  });

  test('documents-new.ejs should have title, classification, owner, description fields', () => {
    const content = fs.readFileSync(path.join(VIEWS_DIR, 'documents-new.ejs'), 'utf-8');

    expect(content).toContain('name="title"');
    expect(content).toContain('name="classification"');
    expect(content).toContain('name="owner"');
    expect(content).toContain('name="description"');
  });

  test('agents-new.ejs should have name and type fields', () => {
    const content = fs.readFileSync(path.join(VIEWS_DIR, 'agents-new.ejs'), 'utf-8');

    expect(content).toContain('name="name"');
    expect(content).toContain('name="type"');
    expect(content).toContain('API key');
  });

  test('roles-new.ejs should have name, description, permissions fields', () => {
    const content = fs.readFileSync(path.join(VIEWS_DIR, 'roles-new.ejs'), 'utf-8');

    expect(content).toContain('name="name"');
    expect(content).toContain('name="description"');
    expect(content).toContain('name="permissions"');
  });

  test('policies-new.ejs should have name, type, target, status fields', () => {
    const content = fs.readFileSync(path.join(VIEWS_DIR, 'policies-new.ejs'), 'utf-8');

    expect(content).toContain('name="name"');
    expect(content).toContain('name="type"');
    expect(content).toContain('name="target"');
    expect(content).toContain('name="status"');
  });

  test('all form views should have CSRF tokens', () => {
    const formViews = [
      'users-new.ejs',
      'documents-new.ejs',
      'roles-new.ejs',
      'policies-new.ejs',
      'agents-new.ejs'
    ];

    for (const view of formViews) {
      const content = fs.readFileSync(path.join(VIEWS_DIR, view), 'utf-8');
      expect(content).toContain('name="_csrf"');
    }
  });

  test('all form views should have cancel buttons', () => {
    const formViews = [
      'users-new.ejs',
      'documents-new.ejs',
      'roles-new.ejs',
      'policies-new.ejs',
      'agents-new.ejs'
    ];

    for (const view of formViews) {
      const content = fs.readFileSync(path.join(VIEWS_DIR, view), 'utf-8');
      expect(content.toLowerCase()).toContain('cancel');
    }
  });
});

test.describe('Phase 6: List View Enhancements', () => {
  test('users.ejs should have flash message blocks', () => {
    const content = fs.readFileSync(path.join(VIEWS_DIR, 'users.ejs'), 'utf-8');

    expect(content).toContain('flashSuccess');
    expect(content).toContain('flashError');
    expect(content).toContain('flash-success');
    expect(content).toContain('flash-error');
  });

  test('documents.ejs should have flash message blocks', () => {
    const content = fs.readFileSync(path.join(VIEWS_DIR, 'documents.ejs'), 'utf-8');

    expect(content).toContain('flashSuccess');
    expect(content).toContain('flashError');
  });

  test('agents.ejs should display masked API keys', () => {
    const content = fs.readFileSync(path.join(VIEWS_DIR, 'agents.ejs'), 'utf-8');

    expect(content).toContain('••••••••');
  });

  test('agents.ejs should have newKey display for one-time API key', () => {
    const content = fs.readFileSync(path.join(VIEWS_DIR, 'agents.ejs'), 'utf-8');

    expect(content).toContain('newKey');
  });

  test('agents.ejs should have activate/deactivate buttons', () => {
    const content = fs.readFileSync(path.join(VIEWS_DIR, 'agents.ejs'), 'utf-8');

    expect(content).toContain('Activate');
    expect(content).toContain('Deactivate');
    expect(content).toContain('Regenerate Key');
  });

  test('access-policies.ejs should have 3 tabs', () => {
    const content = fs.readFileSync(path.join(VIEWS_DIR, 'access-policies.ejs'), 'utf-8');

    expect(content).toContain('RBAC');
    expect(content).toContain('ABAC');
    expect(content).toContain('Policies');
  });

  test('access-policies.ejs should have Phase 7 notice for ABAC', () => {
    const content = fs.readFileSync(path.join(VIEWS_DIR, 'access-policies.ejs'), 'utf-8');

    expect(content).toContain('Phase 7');
  });

  test('access-policies.ejs should have activate/deactivate policy buttons', () => {
    const content = fs.readFileSync(path.join(VIEWS_DIR, 'access-policies.ejs'), 'utf-8');

    expect(content).toContain('activate');
    expect(content).toContain('deactivate');
  });

  test('audit-logs.ejs should have form-based filters', () => {
    const content = fs.readFileSync(path.join(VIEWS_DIR, 'audit-logs.ejs'), 'utf-8');

    expect(content).toContain('method="GET"');
    expect(content).toContain('name="search"');
    expect(content).toContain('name="eventType"');
    expect(content).toContain('name="status"');
    expect(content).toContain('filter-form');
  });

  test('dashboard.ejs should have flash message blocks', () => {
    const content = fs.readFileSync(path.join(VIEWS_DIR, 'dashboard.ejs'), 'utf-8');

    expect(content).toContain('flashSuccess');
    expect(content).toContain('flashError');
  });
});

test.describe('Phase 6: Delete Modal Implementation', () => {
  test('users.ejs should have delete modal', () => {
    const content = fs.readFileSync(path.join(VIEWS_DIR, 'users.ejs'), 'utf-8');

    expect(content).toContain('delete-modal');
    expect(content).toContain('confirmDelete');
    expect(content).toContain('modal-confirm');
    expect(content).toContain('modal-cancel');
  });

  test('documents.ejs should have delete modal', () => {
    const content = fs.readFileSync(path.join(VIEWS_DIR, 'documents.ejs'), 'utf-8');

    expect(content).toContain('delete-modal');
  });

  test('agents.ejs should have delete modal', () => {
    const content = fs.readFileSync(path.join(VIEWS_DIR, 'agents.ejs'), 'utf-8');

    expect(content).toContain('delete-modal');
  });

  test('access-policies.ejs should have delete modal', () => {
    const content = fs.readFileSync(path.join(VIEWS_DIR, 'access-policies.ejs'), 'utf-8');

    expect(content).toContain('delete-modal');
  });
});

test.describe('Phase 6: Backend Routes', () => {
  test('admin.js should have GET /dashboard route', () => {
    const content = fs.readFileSync(ROUTES_FILE, 'utf-8');
    expect(content).toContain("router.get('/dashboard'");
  });

  test('admin.js should have GET /users and POST /users routes', () => {
    const content = fs.readFileSync(ROUTES_FILE, 'utf-8');
    expect(content).toContain("router.get('/users'");
    expect(content).toContain("router.post('/users'");
  });

  test('admin.js should have document routes', () => {
    const content = fs.readFileSync(ROUTES_FILE, 'utf-8');
    expect(content).toContain("router.get('/documents'");
    expect(content).toContain("router.post('/documents'");
  });

  test('admin.js should have agent routes including regenerate-key', () => {
    const content = fs.readFileSync(ROUTES_FILE, 'utf-8');
    expect(content).toContain("router.post('/agents'");
    expect(content).toContain('regenerate-key');
  });

  test('admin.js should have policy activate/deactivate routes', () => {
    const content = fs.readFileSync(ROUTES_FILE, 'utf-8');
    expect(content).toContain('activate');
    expect(content).toContain('deactivate');
  });

  test('admin.js should have audit logging on POST routes', () => {
    const content = fs.readFileSync(ROUTES_FILE, 'utf-8');
    expect(content).toContain('AuditLogService.createLog');
  });

  test('admin.js should filter by tenantId', () => {
    const content = fs.readFileSync(ROUTES_FILE, 'utf-8');
    expect(content).toContain('tenantId: req.user.tenantId');
  });

  test('admin.js should use asyncHandler for error handling', () => {
    const content = fs.readFileSync(ROUTES_FILE, 'utf-8');
    expect(content).toContain('asyncHandler');
  });

  test('admin.js should use flash redirects for success/error', () => {
    const content = fs.readFileSync(ROUTES_FILE, 'utf-8');
    expect(content).toContain('flash(res');
  });
});

test.describe('Phase 6: Security Features', () => {
  test('all forms should protect against CSRF with hidden _csrf tokens', () => {
    const forms = [
      'users-new.ejs',
      'users-edit.ejs',
      'documents-new.ejs',
      'documents-edit.ejs',
      'agents-new.ejs',
      'agents-edit.ejs',
      'roles-new.ejs',
      'roles-edit.ejs',
      'policies-new.ejs',
      'policies-edit.ejs'
    ];

    for (const form of forms) {
      const content = fs.readFileSync(path.join(VIEWS_DIR, form), 'utf-8');
      expect(content).toContain('_csrf');
    }
  });

  test('delete forms should have CSRF tokens', () => {
    const views = ['users.ejs', 'documents.ejs', 'agents.ejs'];

    for (const view of views) {
      const content = fs.readFileSync(path.join(VIEWS_DIR, view), 'utf-8');
      expect(content).toContain('_csrf');
    }
  });
});

test.describe('Phase 6: UX Patterns', () => {
  test('pagination should be present in list views', () => {
    const views = ['users.ejs', 'documents.ejs'];

    for (const view of views) {
      const content = fs.readFileSync(path.join(VIEWS_DIR, view), 'utf-8');
      expect(content).toContain('pagination');
    }
  });

  test('edit links should be real links, not onclick alerts', () => {
    const views = ['users.ejs', 'documents.ejs', 'agents.ejs'];

    for (const view of views) {
      const content = fs.readFileSync(path.join(VIEWS_DIR, view), 'utf-8');
      // Should have href attribute
      expect(content).toContain('/edit');
      // Should NOT have onclick="alert"
      expect(content).not.toContain('onclick="alert');
    }
  });

  test('create buttons should link to form views, not trigger alerts', () => {
    const content = fs.readFileSync(path.join(VIEWS_DIR, 'users.ejs'), 'utf-8');
    expect(content).toContain('/users/new');
    expect(content).not.toContain('onclick="alert');
  });
});

test.describe('Phase 6: Documentation', () => {
  test('PHASE_6_COMPLETE.md should exist with implementation details', () => {
    const docPath = path.join(__dirname, '../PHASE_6_COMPLETE.md');
    expect(fs.existsSync(docPath)).toBeTruthy();

    const content = fs.readFileSync(docPath, 'utf-8');
    expect(content).toContain('Phase 6');
    expect(content).toContain('CRUD');
    expect(content).toContain('flash');
  });

  test('PHASE_6_TEST_REPORT.md should exist', () => {
    const reportPath = path.join(__dirname, '../PHASE_6_TEST_REPORT.md');
    expect(fs.existsSync(reportPath)).toBeTruthy();
  });
});
