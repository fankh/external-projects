CREATE TYPE workflow_status AS ENUM ('draft', 'active', 'archived');
CREATE TYPE workflow_execution_status AS ENUM ('pending', 'running', 'completed', 'failed');
CREATE TYPE step_type AS ENUM ('llm_call', 'rag_search', 'transform', 'validate', 'output');

CREATE TABLE workflows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    purpose_id VARCHAR(100) REFERENCES purposes(id),
    steps JSONB NOT NULL DEFAULT '[]',
    input_schema JSONB DEFAULT '{}',
    output_format VARCHAR(50) NOT NULL DEFAULT 'markdown',
    status workflow_status NOT NULL DEFAULT 'draft',
    is_system BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE workflow_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID NOT NULL REFERENCES workflows(id),
    user_id UUID NOT NULL REFERENCES users(id),
    input JSONB NOT NULL,
    output JSONB,
    status workflow_execution_status NOT NULL DEFAULT 'pending',
    current_step INTEGER NOT NULL DEFAULT 0,
    step_results JSONB DEFAULT '[]',
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_wf_executions_user ON workflow_executions(user_id);
