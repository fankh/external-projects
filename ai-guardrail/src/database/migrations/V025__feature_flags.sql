-- V025: Feature flags
CREATE TABLE IF NOT EXISTS feature_flags (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key         TEXT NOT NULL UNIQUE,
    description TEXT,
    enabled     BOOLEAN NOT NULL DEFAULT FALSE,
    tenant_overrides JSONB NOT NULL DEFAULT '{}',  -- {"tenant-uuid": true/false}
    percentage  INTEGER,   -- gradual rollout 0-100 (NULL = binary)
    metadata    JSONB,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ff_key ON feature_flags(key);

-- Seed a few standard flags
INSERT INTO feature_flags (key, description, enabled) VALUES
    ('rag_enabled', 'RAG document retrieval', TRUE),
    ('agents_enabled', 'Agentic tool execution', FALSE),
    ('memory_enabled', 'Long-term conversation memory', TRUE),
    ('streaming_enabled', 'SSE streaming responses', TRUE),
    ('multi_modal_enabled', 'Vision/audio/image support', FALSE),
    ('phi_scanning_enabled', 'HIPAA PHI detection on every message', TRUE),
    ('semantic_cache_enabled', 'L2 semantic response cache', FALSE),
    ('injection_l3_enabled', 'Prompt injection semantic layer', TRUE)
ON CONFLICT (key) DO NOTHING;
