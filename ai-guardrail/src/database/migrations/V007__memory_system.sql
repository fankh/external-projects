CREATE TYPE memory_type AS ENUM ('episodic', 'semantic', 'procedural', 'entity');
CREATE TYPE memory_status AS ENUM ('active', 'archived', 'expired');

CREATE TABLE long_term_memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id),
    memory_type memory_type NOT NULL,
    key VARCHAR(500) NOT NULL,
    value TEXT NOT NULL,
    importance FLOAT NOT NULL DEFAULT 0.5,
    confidence FLOAT NOT NULL DEFAULT 0.8,
    access_count INTEGER NOT NULL DEFAULT 0,
    last_accessed_at TIMESTAMPTZ,
    source_message_id UUID REFERENCES messages(id),
    metadata JSONB DEFAULT '{}',
    status memory_status NOT NULL DEFAULT 'active',
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ltm_user ON long_term_memories(user_id);
CREATE INDEX idx_ltm_user_type ON long_term_memories(user_id, memory_type);
CREATE INDEX idx_ltm_active ON long_term_memories(user_id) WHERE status = 'active';

CREATE TABLE memory_summaries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    summary TEXT NOT NULL,
    key_topics TEXT[],
    entity_count INTEGER NOT NULL DEFAULT 0,
    message_range_start INTEGER NOT NULL,
    message_range_end INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(conversation_id, message_range_start)
);
