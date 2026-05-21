-- V023: Connector sync run log
CREATE TABLE IF NOT EXISTS connector_sync_runs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID,
    collection_id UUID,
    connector     TEXT NOT NULL,            -- s3 | rest | confluence | sharepoint | gdrive | smb | nfs | sftp
    status        TEXT NOT NULL,            -- accepted | failed
    queued        INTEGER NOT NULL DEFAULT 0,
    skipped       INTEGER NOT NULL DEFAULT 0,
    errors        INTEGER NOT NULL DEFAULT 0,
    started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at  TIMESTAMPTZ,
    duration_ms   INTEGER,
    request_meta  JSONB,
    error_summary TEXT
);
CREATE INDEX IF NOT EXISTS idx_csr_collection ON connector_sync_runs(collection_id);
CREATE INDEX IF NOT EXISTS idx_csr_connector ON connector_sync_runs(connector);
CREATE INDEX IF NOT EXISTS idx_csr_started ON connector_sync_runs(started_at DESC);
