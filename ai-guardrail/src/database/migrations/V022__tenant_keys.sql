-- V022: Tenant encryption key rotation scaffold
CREATE TABLE IF NOT EXISTS tenant_keys (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL,
    key_alias     TEXT NOT NULL,             -- KMS alias or local key id
    key_version   INTEGER NOT NULL DEFAULT 1,
    algorithm     TEXT NOT NULL DEFAULT 'AES-256-GCM',
    state         TEXT NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE | PENDING_DEACTIVATION | DEACTIVATED
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    activated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deactivated_at TIMESTAMPTZ,
    metadata      JSONB
);
CREATE INDEX IF NOT EXISTS idx_tk_tenant ON tenant_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tk_state ON tenant_keys(state);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tk_one_active ON tenant_keys(tenant_id) WHERE state = 'ACTIVE';
