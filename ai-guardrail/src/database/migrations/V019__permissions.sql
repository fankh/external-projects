-- V019: Fine-grained permission grants (RBAC+ABAC foundation)
-- A grant binds a subject (USER/ROLE/TENANT/GLOBAL) to an action on a resource
-- (wildcard allowed). DENY grants override ALLOW. Conditions support ABAC-style
-- attribute matching (e.g. {"department": "legal"}).

CREATE TABLE IF NOT EXISTS permission_grants (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID,                           -- NULL = cross-tenant grant (admin use)
    subject_type   TEXT NOT NULL,                  -- USER | ROLE | TENANT | GLOBAL
    subject_id     TEXT,                           -- UUID for USER/TENANT, role name for ROLE, NULL for GLOBAL
    resource_type  TEXT NOT NULL,                  -- e.g. privacy, audit, rag_collection, conversation, tenant, *
    resource_id    TEXT,                           -- NULL = wildcard across all resources of this type
    action         TEXT NOT NULL,                  -- e.g. read, write, fulfill, delete, * (wildcard)
    effect         TEXT NOT NULL DEFAULT 'ALLOW',  -- ALLOW | DENY
    conditions     JSONB,                          -- optional ABAC conditions
    description    TEXT,
    created_by     UUID,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pg_subject ON permission_grants(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_pg_resource ON permission_grants(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_pg_tenant ON permission_grants(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pg_effect ON permission_grants(effect);

-- Seed a few sensible defaults: admin role gets * on * (compat with existing behavior)
INSERT INTO permission_grants (tenant_id, subject_type, subject_id, resource_type, resource_id, action, effect, description)
SELECT NULL, 'ROLE', 'admin', '*', NULL, '*', 'ALLOW', 'admin role: full wildcard (seeded)'
WHERE NOT EXISTS (SELECT 1 FROM permission_grants WHERE subject_type='ROLE' AND subject_id='admin' AND resource_type='*' AND action='*');
