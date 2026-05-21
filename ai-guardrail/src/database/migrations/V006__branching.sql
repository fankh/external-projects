CREATE TABLE conversation_branches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    parent_message_id UUID NOT NULL REFERENCES messages(id),
    branch_name VARCHAR(255),
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID NOT NULL REFERENCES users(id),
    first_message_id UUID REFERENCES messages(id),
    message_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_branches_conversation ON conversation_branches(conversation_id);

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS current_branch_id UUID REFERENCES conversation_branches(id);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS has_branches BOOLEAN NOT NULL DEFAULT FALSE;
