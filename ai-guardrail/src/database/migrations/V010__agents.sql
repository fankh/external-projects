CREATE TYPE agent_type AS ENUM ('conversational', 'task_executor', 'workflow_runner', 'background', 'scheduled');
CREATE TYPE execution_status AS ENUM ('pending', 'planning', 'running', 'awaiting_approval', 'completed', 'failed', 'cancelled');
CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE agent_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    agent_type agent_type NOT NULL,
    description TEXT,
    system_prompt TEXT,
    allowed_tools TEXT[] NOT NULL DEFAULT '{}',
    max_steps INTEGER NOT NULL DEFAULT 10,
    timeout_seconds INTEGER NOT NULL DEFAULT 300,
    requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE agent_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agent_configs(id),
    user_id UUID NOT NULL REFERENCES users(id),
    task_description TEXT NOT NULL,
    parameters JSONB DEFAULT '{}',
    status execution_status NOT NULL DEFAULT 'pending',
    current_step INTEGER NOT NULL DEFAULT 0,
    total_steps INTEGER,
    plan JSONB,
    result JSONB,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_executions_user ON agent_executions(user_id);
CREATE INDEX idx_executions_status ON agent_executions(status);

CREATE TABLE execution_steps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    execution_id UUID NOT NULL REFERENCES agent_executions(id) ON DELETE CASCADE,
    step_number INTEGER NOT NULL,
    tool_name VARCHAR(100) NOT NULL,
    tool_input JSONB NOT NULL DEFAULT '{}',
    tool_output JSONB,
    status execution_status NOT NULL DEFAULT 'pending',
    error_message TEXT,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE agent_approvals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    execution_id UUID NOT NULL REFERENCES agent_executions(id) ON DELETE CASCADE,
    step_id UUID REFERENCES execution_steps(id),
    action_description TEXT NOT NULL,
    risk_level VARCHAR(20) NOT NULL DEFAULT 'medium',
    status approval_status NOT NULL DEFAULT 'pending',
    reviewed_by UUID REFERENCES users(id),
    review_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ
);
