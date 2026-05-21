-- V028: Workflow engine
CREATE TABLE IF NOT EXISTS workflow_definitions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID,
    name        TEXT NOT NULL,
    description TEXT,
    steps       JSONB NOT NULL,           -- [{id, type, config, next_step_id}]
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    version     INTEGER NOT NULL DEFAULT 1,
    created_by  UUID,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_runs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id     UUID NOT NULL REFERENCES workflow_definitions(id),
    tenant_id       UUID,
    status          TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING|RUNNING|COMPLETED|FAILED|CANCELLED
    current_step_id TEXT,
    input           JSONB,
    output          JSONB,
    step_results    JSONB NOT NULL DEFAULT '[]',
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    error           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wd_tenant ON workflow_definitions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wr_workflow ON workflow_runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_wr_status ON workflow_runs(status);

-- Seed a sample workflow
INSERT INTO workflow_definitions (tenant_id, name, description, steps) VALUES
    (NULL, 'Document Ingestion Pipeline', 'Upload → classify → scan PHI → index to RAG',
     '[{"id":"upload","type":"input","config":{"accept":"pdf,docx,txt"},"next":"classify"},
       {"id":"classify","type":"api_call","config":{"url":"/api/v1/phi/scan","method":"POST"},"next":"index"},
       {"id":"index","type":"api_call","config":{"url":"/api/v1/rag/connectors/rest/sync","method":"POST"},"next":null}]')
ON CONFLICT DO NOTHING;
