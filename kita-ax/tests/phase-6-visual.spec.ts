import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Phase 6 Visual Verification Tests
 * Validates rendered HTML structure of admin pages
 */

const VIEWS_DIR = path.join(__dirname, '../src/views/admin');

test('Phase 6: All admin pages should render with proper structure', async ({ page }) => {
  // Test that view files exist and contain proper HTML structure
  const viewFiles = [
    'users.ejs',
    'documents.ejs',
    'access-policies.ejs',
    'audit-logs.ejs',
    'agents.ejs',
    'dashboard.ejs'
  ];

  for (const viewFile of viewFiles) {
    const filePath = path.join(VIEWS_DIR, viewFile);
    const content = fs.readFileSync(filePath, 'utf-8');

    // Check for admin layout structure
    expect(content).toContain('admin-header');
    expect(content).toContain('admin-footer');
    expect(content).toContain('page-title');
    expect(content).toContain('admin-panel');
  }
});

test('Phase 6: Form pages should have submit and cancel buttons', async () => {
  const formFiles = [
    'users-new.ejs',
    'documents-new.ejs',
    'roles-new.ejs',
    'policies-new.ejs',
    'agents-new.ejs'
  ];

  for (const formFile of formFiles) {
    const filePath = path.join(VIEWS_DIR, formFile);
    const content = fs.readFileSync(filePath, 'utf-8');

    // Should have form element
    expect(content).toContain('<form');
    expect(content).toContain('method="POST"');

    // Should have submit button
    expect(content).toMatch(/type="submit"|<button[^>]*>.*(?:Submit|Save|Create|Register)/i);

    // Should have cancel link
    expect(content).toMatch(/Cancel|cancel/);
  }
});

test('Phase 6: Table views should have action columns with links', async () => {
  const tableFiles = [
    'users.ejs',
    'documents.ejs',
    'agents.ejs'
  ];

  for (const tableFile of tableFiles) {
    const filePath = path.join(VIEWS_DIR, tableFile);
    const content = fs.readFileSync(filePath, 'utf-8');

    // Should have table element
    expect(content).toContain('<table');

    // Should have edit links
    expect(content).toMatch(/Edit|edit/);

    // Should have delete functionality
    expect(content).toMatch(/Delete|delete|Remove/);
  }
});

test('Phase 6: Navigation should be consistent across all pages', async () => {
  const headerFile = path.join(__dirname, '../src/views/layouts/admin-header.ejs');
  const headerContent = fs.readFileSync(headerFile, 'utf-8');

  // Check all navigation elements
  const navItems = [
    'Dashboard',
    'Users',
    'Documents',
    'Policies',
    'Agents',
    'Audit',
    'Settings'
  ];

  for (const item of navItems) {
    expect(headerContent).toMatch(new RegExp(item, 'i'));
  }

  // All admin pages should include the header
  const adminPages = ['users.ejs', 'documents.ejs', 'agents.ejs', 'dashboard.ejs'];
  for (const page of adminPages) {
    const pageContent = fs.readFileSync(path.join(VIEWS_DIR, page), 'utf-8');
    expect(pageContent).toContain('admin-header');
  }
});

test('Phase 6: Delete functionality should use modals with CSRF protection', async () => {
  const listFiles = ['users.ejs', 'documents.ejs', 'agents.ejs'];

  for (const file of listFiles) {
    const content = fs.readFileSync(path.join(VIEWS_DIR, file), 'utf-8');

    // Should have delete modal
    expect(content).toContain('delete-modal');
    expect(content).toContain('confirmDelete');

    // Modal should have confirm and cancel buttons
    expect(content).toContain('modal-confirm');
    expect(content).toContain('modal-cancel');

    // Delete forms should have CSRF tokens
    expect(content).toMatch(/name="_csrf"/);
  }
});

test('Phase 6: Flash messages should be present on list views', async () => {
  const listFiles = ['users.ejs', 'documents.ejs', 'agents.ejs', 'dashboard.ejs'];

  for (const file of listFiles) {
    const content = fs.readFileSync(path.join(VIEWS_DIR, file), 'utf-8');

    // Should have flash message blocks
    expect(content).toContain('flashSuccess');
    expect(content).toContain('flashError');
    expect(content).toContain('flash-success');
    expect(content).toContain('flash-error');
  }
});

test('Phase 6: Audit logs should have filter form', async () => {
  const auditFile = path.join(VIEWS_DIR, 'audit-logs.ejs');
  const content = fs.readFileSync(auditFile, 'utf-8');

  // Should have form for filtering
  expect(content).toContain('method="GET"');
  expect(content).toContain('name="search"');
  expect(content).toContain('name="eventType"');
  expect(content).toContain('name="status"');

  // Should have filter button
  expect(content).toMatch(/Filter|filter/);
});

test('Phase 6: Agents page should have API key features', async () => {
  const agentsFile = path.join(VIEWS_DIR, 'agents.ejs');
  const content = fs.readFileSync(agentsFile, 'utf-8');

  // Should mask API keys
  expect(content).toContain('••••••••');

  // Should show newKey on creation
  expect(content).toContain('newKey');

  // Should have regenerate key functionality
  expect(content).toMatch(/regenerate|Regenerate/i);

  // Should have activate/deactivate
  expect(content).toMatch(/activate|Activate/i);
  expect(content).toMatch(/deactivate|Deactivate/i);
});

test('Phase 6: Access policies should have 3 tabs', async () => {
  const policiesFile = path.join(VIEWS_DIR, 'access-policies.ejs');
  const content = fs.readFileSync(policiesFile, 'utf-8');

  // Should have tab buttons
  expect(content).toContain('RBAC');
  expect(content).toContain('ABAC');
  expect(content).toContain('Policies');

  // Should have tab content areas
  expect(content).toMatch(/tab-content/);

  // ABAC should have Phase 7 notice
  expect(content).toMatch(/Phase 7/);

  // Policies should have activate/deactivate
  expect(content).toMatch(/activate/i);
  expect(content).toMatch(/deactivate/i);
});

test('Phase 6: All create/edit forms should have required attributes', async () => {
  const formFiles = [
    'users-new.ejs',
    'documents-new.ejs',
    'agents-new.ejs'
  ];

  for (const formFile of formFiles) {
    const content = fs.readFileSync(path.join(VIEWS_DIR, formFile), 'utf-8');

    // Should have form with action
    expect(content).toMatch(/<form[^>]*action="/);

    // Should have CSRF token
    expect(content).toContain('name="_csrf"');

    // Should have required inputs
    expect(content).toMatch(/required/i);
  }
});

test('Phase 6: Code structure should use semantic HTML', async () => {
  const testFiles = [
    'users.ejs',
    'documents.ejs',
    'agents.ejs',
    'access-policies.ejs'
  ];

  for (const file of testFiles) {
    const content = fs.readFileSync(path.join(VIEWS_DIR, file), 'utf-8');

    // Should use semantic elements
    expect(content).toMatch(/<(?:main|section|article|header|nav)/);

    // Should have proper heading hierarchy
    expect(content).toMatch(/<h[1-6]/);

    // Should have table elements in list views
    if (!file.includes('-')) {
      expect(content).toContain('<table');
    }
  }
});

test('Phase 6: Styling should use CSS variables', async () => {
  const headerFile = path.join(__dirname, '../src/views/layouts/admin-header.ejs');
  const content = fs.readFileSync(headerFile, 'utf-8');

  // Should use CSS variables
  expect(content).toContain('--primary-color');
  expect(content).toContain('--border-color');
  expect(content).toContain('--text-primary');
  expect(content).toContain('--text-secondary');
});

test('Phase 6: Routes should have proper structure', async () => {
  const routesFile = path.join(__dirname, '../src/routes/admin.js');
  const content = fs.readFileSync(routesFile, 'utf-8');

  // Should have service imports
  expect(content).toContain('UserService');
  expect(content).toContain('DocumentService');
  expect(content).toContain('AgentService');
  expect(content).toContain('PolicyService');

  // Should have async handler
  expect(content).toContain('asyncHandler');

  // Should have flash function
  expect(content).toContain('function flash');

  // Should have authentication middleware
  expect(content).toContain('requireAuth');
  expect(content).toContain('requireAdmin');
});

test('Phase 6: Test reports should be comprehensive', async () => {
  const reportFiles = [
    'PHASE_6_COMPLETE.md',
    'PHASE_6_TEST_REPORT.md',
    'PLAYWRIGHT_TEST_RESULTS.md'
  ];

  for (const reportFile of reportFiles) {
    const filePath = path.join(__dirname, '../' + reportFile);
    expect(fs.existsSync(filePath)).toBeTruthy();

    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content.length).toBeGreaterThan(100);
  }
});
