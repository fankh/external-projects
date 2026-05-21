-- ============================================================
-- KYRA AI Guardrail - Initial Database Schema
-- PostgreSQL 16.x
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- Enums
-- ============================================================
CREATE TYPE user_status AS ENUM ('active', 'suspended', 'pending', 'deactivated');
CREATE TYPE auth_provider AS ENUM ('local', 'saml', 'oidc', 'ldap');
CREATE TYPE conversation_status AS ENUM ('active', 'archived', 'deleted');
CREATE TYPE message_role AS ENUM ('user', 'assistant', 'system');
CREATE TYPE message_status AS ENUM ('pending', 'streaming', 'complete', 'failed', 'blocked');
CREATE TYPE document_status AS ENUM ('pending', 'processing', 'indexed', 'failed');
CREATE TYPE file_type AS ENUM ('pdf', 'docx', 'txt', 'md', 'html', 'csv', 'xlsx');
CREATE TYPE collection_access_level AS ENUM ('organization', 'department', 'private');
CREATE TYPE dlp_category AS ENUM ('pii', 'financial', 'credentials', 'healthcare', 'intellectual_property', 'custom');
CREATE TYPE dlp_action AS ENUM ('block', 'redact', 'log', 'alert');
CREATE TYPE severity_level AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE risk_level AS ENUM ('normal', 'watch', 'warning', 'critical');
CREATE TYPE event_type AS ENUM ('prompt_injection', 'jailbreak', 'data_exfil', 'rate_evasion', 'dlp_violation', 'auth_failed');
CREATE TYPE detection_method AS ENUM ('pattern', 'ml', 'behavioral');
CREATE TYPE report_type AS ENUM ('usage', 'security', 'compliance', 'team_summary');
CREATE TYPE report_status AS ENUM ('pending', 'generating', 'ready', 'failed');
CREATE TYPE report_format AS ENUM ('pdf', 'xlsx', 'json', 'csv');
CREATE TYPE feedback_rating AS ENUM ('positive', 'negative');
CREATE TYPE share_type AS ENUM ('email', 'teams', 'slack', 'link');
CREATE TYPE queue_status AS ENUM ('pending', 'processing', 'completed', 'failed');

-- ============================================================
-- Core Tables
-- ============================================================

-- Departments
CREATE TABLE departments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    parent_id UUID REFERENCES departments(id),
    daily_budget INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Roles
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    permissions JSONB NOT NULL DEFAULT '[]',
    level INTEGER NOT NULL DEFAULT 0,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Quota Tiers
CREATE TABLE quota_tiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    queries_per_hour INTEGER NOT NULL DEFAULT 50,
    queries_per_day INTEGER NOT NULL DEFAULT 200,
    tokens_per_query INTEGER NOT NULL DEFAULT 4096,
    tokens_per_day BIGINT NOT NULL DEFAULT 100000,
    rag_queries_per_day INTEGER NOT NULL DEFAULT 50,
    document_uploads_per_day INTEGER NOT NULL DEFAULT 10,
    image_analysis_per_day INTEGER NOT NULL DEFAULT 20,
    code_executions_per_day INTEGER NOT NULL DEFAULT 50,
    queue_priority INTEGER NOT NULL DEFAULT 5,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    name VARCHAR(255) NOT NULL,
    avatar_url VARCHAR(500),
    department_id UUID REFERENCES departments(id),
    role_id UUID REFERENCES roles(id),
    manager_id UUID REFERENCES users(id),
    quota_tier_id UUID REFERENCES quota_tiers(id),
    status user_status NOT NULL DEFAULT 'active',
    sso_provider auth_provider,
    sso_subject_id VARCHAR(255),
    mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_secret VARCHAR(255),
    mfa_backup_codes TEXT[],
    preferences JSONB DEFAULT '{"theme": "light", "language": "en"}',
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_department ON users(department_id);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_active ON users(id) WHERE status = 'active';
CREATE INDEX idx_users_sso ON users(sso_provider, sso_subject_id) WHERE sso_provider IS NOT NULL;

-- Sessions
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash VARCHAR(255) NOT NULL,
    device_info JSONB,
    ip_address INET,
    user_agent TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at TIMESTAMPTZ NOT NULL,
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_active ON sessions(user_id) WHERE is_active = TRUE;
CREATE INDEX idx_sessions_expiry ON sessions(expires_at);

-- ============================================================
-- Personas & Purposes
-- ============================================================

CREATE TABLE personas (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(50),
    color VARCHAR(20),
    category VARCHAR(50),
    system_prompt TEXT NOT NULL,
    guardrails JSONB DEFAULT '{}',
    rag_collections TEXT[],
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_system BOOLEAN NOT NULL DEFAULT TRUE,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE purposes (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(50),
    category VARCHAR(50),
    workflow_steps JSONB DEFAULT '[]',
    prompt_template TEXT,
    output_format VARCHAR(20) DEFAULT 'text',
    suggested_personas TEXT[],
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_system BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Chat & Conversations
-- ============================================================

CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL DEFAULT 'New Conversation',
    persona_id VARCHAR(100) REFERENCES personas(id),
    purpose_id VARCHAR(100) REFERENCES purposes(id),
    status conversation_status NOT NULL DEFAULT 'active',
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
    memory_summary TEXT,
    message_count INTEGER NOT NULL DEFAULT 0,
    last_message_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conversations_user ON conversations(user_id);
CREATE INDEX idx_conversations_user_status ON conversations(user_id, status);
CREATE INDEX idx_conversations_user_last_msg ON conversations(user_id, last_message_at DESC);
CREATE INDEX idx_conversations_pinned ON conversations(user_id) WHERE is_pinned = TRUE;
CREATE INDEX idx_conversations_title_search ON conversations USING GIN (to_tsvector('english', title));

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role message_role NOT NULL,
    content TEXT NOT NULL,
    persona_id VARCHAR(100),
    attachments JSONB DEFAULT '[]',
    rag_sources JSONB DEFAULT '[]',
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    model_id VARCHAR(100),
    finish_reason VARCHAR(50),
    is_edited BOOLEAN NOT NULL DEFAULT FALSE,
    original_content TEXT,
    status message_status NOT NULL DEFAULT 'complete',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_conversation_created ON messages(conversation_id, created_at);
CREATE INDEX idx_messages_content_search ON messages USING GIN (to_tsvector('english', content));

CREATE TABLE message_feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating feedback_rating NOT NULL,
    score INTEGER CHECK (score >= 1 AND score <= 5),
    categories TEXT[],
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(message_id, user_id)
);

CREATE TABLE conversation_memory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    memory_type VARCHAR(50) NOT NULL,
    key VARCHAR(255) NOT NULL,
    value TEXT NOT NULL,
    confidence FLOAT,
    source_message_id UUID REFERENCES messages(id),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conv_memory ON conversation_memory(conversation_id);

-- ============================================================
-- RAG / Documents
-- ============================================================

CREATE TABLE collections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    access_level collection_access_level NOT NULL DEFAULT 'private',
    owner_id UUID REFERENCES users(id),
    chunking_config JSONB DEFAULT '{"method": "recursive", "chunkSize": 512, "chunkOverlap": 50}',
    embedding_model VARCHAR(100) DEFAULT 'all-MiniLM-L6-v2',
    document_count INTEGER NOT NULL DEFAULT 0,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    total_size_bytes BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    milvus_collection_name VARCHAR(255),
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_collections_owner ON collections(owner_id);
CREATE INDEX idx_collections_access ON collections(access_level);

CREATE TABLE collection_access (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
    permission VARCHAR(20) NOT NULL DEFAULT 'read',
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    granted_by UUID REFERENCES users(id),
    CONSTRAINT chk_access_target CHECK (
        (user_id IS NOT NULL AND department_id IS NULL) OR
        (user_id IS NULL AND department_id IS NOT NULL)
    )
);

CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_type file_type NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    file_path VARCHAR(1000),
    status document_status NOT NULL DEFAULT 'pending',
    chunk_count INTEGER DEFAULT 0,
    page_count INTEGER,
    processing_time_ms INTEGER,
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    content_hash VARCHAR(64),
    security_scan JSONB DEFAULT '{"status": "pending"}',
    uploaded_by UUID NOT NULL REFERENCES users(id),
    indexed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_documents_collection ON documents(collection_id);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_hash ON documents(content_hash);
CREATE INDEX idx_documents_pending ON documents(id) WHERE status = 'pending';
CREATE INDEX idx_documents_title_search ON documents USING GIN (to_tsvector('english', title));

CREATE TABLE document_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    page_number INTEGER,
    section_title VARCHAR(500),
    parent_chunk_id UUID REFERENCES document_chunks(id),
    chunk_level INTEGER NOT NULL DEFAULT 0,
    vector_id VARCHAR(100),
    token_count INTEGER,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chunks_document ON document_chunks(document_id);
CREATE INDEX idx_chunks_parent ON document_chunks(parent_chunk_id);
CREATE INDEX idx_chunks_vector ON document_chunks(vector_id);

-- ============================================================
-- Security
-- ============================================================

CREATE TABLE dlp_patterns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    category dlp_category NOT NULL,
    pattern_type VARCHAR(20) NOT NULL DEFAULT 'regex',
    pattern TEXT NOT NULL,
    severity severity_level NOT NULL DEFAULT 'medium',
    action dlp_action NOT NULL DEFAULT 'log',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_system BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dlp_active ON dlp_patterns(category) WHERE is_active = TRUE;

CREATE TABLE security_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    event_type event_type NOT NULL,
    severity severity_level NOT NULL,
    trigger_content TEXT,
    detection_method detection_method NOT NULL DEFAULT 'pattern',
    confidence_score FLOAT,
    action_taken VARCHAR(50),
    conversation_id UUID REFERENCES conversations(id),
    message_id UUID REFERENCES messages(id),
    metadata JSONB DEFAULT '{}',
    reviewed BOOLEAN NOT NULL DEFAULT FALSE,
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_security_events_user ON security_events(user_id);
CREATE INDEX idx_security_events_type ON security_events(event_type);
CREATE INDEX idx_security_events_severity ON security_events(severity);
CREATE INDEX idx_security_events_created ON security_events(created_at);
CREATE INDEX idx_security_events_unreviewed ON security_events(id) WHERE reviewed = FALSE AND severity IN ('high', 'critical');

CREATE TABLE user_risk_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 100),
    risk_level risk_level NOT NULL DEFAULT 'normal',
    factors JSONB DEFAULT '[]',
    score_history JSONB DEFAULT '[]',
    rate_limited BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_required BOOLEAN NOT NULL DEFAULT FALSE,
    last_calculated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_risk_level ON user_risk_scores(risk_level);
CREATE INDEX idx_risk_score ON user_risk_scores(score DESC);

-- Audit Logs (partitioned by month)
CREATE TABLE audit_logs (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    user_id UUID,
    session_id UUID,
    ip_address INET,
    user_agent TEXT,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id UUID,
    details JSONB DEFAULT '{}',
    status VARCHAR(20) NOT NULL DEFAULT 'success',
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_created ON audit_logs(created_at);

-- Create partitions for current and next months
CREATE TABLE audit_logs_default PARTITION OF audit_logs DEFAULT;

-- ============================================================
-- Analytics
-- ============================================================

CREATE TABLE usage_daily (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id),
    department_id UUID REFERENCES departments(id),
    persona_id VARCHAR(100),
    purpose_id VARCHAR(100),
    query_count INTEGER NOT NULL DEFAULT 0,
    token_count BIGINT NOT NULL DEFAULT 0,
    prompt_tokens BIGINT NOT NULL DEFAULT 0,
    completion_tokens BIGINT NOT NULL DEFAULT 0,
    conversation_count INTEGER NOT NULL DEFAULT 0,
    rag_query_count INTEGER NOT NULL DEFAULT 0,
    document_upload_count INTEGER NOT NULL DEFAULT 0,
    positive_feedback INTEGER NOT NULL DEFAULT 0,
    negative_feedback INTEGER NOT NULL DEFAULT 0,
    UNIQUE(date, user_id, persona_id, purpose_id)
);

CREATE INDEX idx_usage_date ON usage_daily(date);
CREATE INDEX idx_usage_user_date ON usage_daily(user_id, date);
CREATE INDEX idx_usage_dept_date ON usage_daily(department_id, date);

CREATE TABLE user_usage_current (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    queries_today INTEGER NOT NULL DEFAULT 0,
    tokens_today BIGINT NOT NULL DEFAULT 0,
    rag_queries_today INTEGER NOT NULL DEFAULT 0,
    uploads_today INTEGER NOT NULL DEFAULT 0,
    images_today INTEGER NOT NULL DEFAULT 0,
    code_executions_today INTEGER NOT NULL DEFAULT 0,
    queries_this_hour INTEGER NOT NULL DEFAULT 0,
    hour_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    day_started_at DATE NOT NULL DEFAULT CURRENT_DATE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Reports
-- ============================================================

CREATE TABLE report_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_type VARCHAR(50) NOT NULL,
    scope VARCHAR(20) NOT NULL,
    scope_id UUID,
    format report_format NOT NULL DEFAULT 'pdf',
    frequency VARCHAR(20) NOT NULL DEFAULT 'weekly',
    day_of_week INTEGER CHECK (day_of_week >= 0 AND day_of_week <= 6),
    day_of_month INTEGER CHECK (day_of_month >= 1 AND day_of_month <= 31),
    time_of_day TIME NOT NULL DEFAULT '08:00:00',
    timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
    recipients TEXT[],
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES users(id),
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_type report_type NOT NULL,
    scope VARCHAR(20) NOT NULL,
    scope_id UUID,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    format report_format NOT NULL DEFAULT 'pdf',
    status report_status NOT NULL DEFAULT 'pending',
    file_path VARCHAR(1000),
    file_size_bytes BIGINT,
    schedule_id UUID REFERENCES report_schedules(id),
    requested_by UUID REFERENCES users(id),
    generated_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Bookmarks
-- ============================================================

CREATE TABLE bookmark_folders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    color VARCHAR(20),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE bookmarks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    highlighted_text TEXT,
    note TEXT,
    folder_id UUID REFERENCES bookmark_folders(id) ON DELETE SET NULL,
    tags TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bookmarks_user ON bookmarks(user_id);

-- ============================================================
-- Sharing
-- ============================================================

CREATE TABLE shared_content (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shared_by UUID NOT NULL REFERENCES users(id),
    message_id UUID NOT NULL REFERENCES messages(id),
    conversation_id UUID NOT NULL REFERENCES conversations(id),
    share_type share_type NOT NULL,
    recipient_emails TEXT[],
    note TEXT,
    include_original_question BOOLEAN DEFAULT TRUE,
    include_full_thread BOOLEAN DEFAULT FALSE,
    include_citations BOOLEAN DEFAULT TRUE,
    share_token VARCHAR(255) UNIQUE,
    expires_at TIMESTAMPTZ,
    view_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE share_access_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shared_content_id UUID NOT NULL REFERENCES shared_content(id) ON DELETE CASCADE,
    accessed_by UUID REFERENCES users(id),
    accessed_by_email VARCHAR(255),
    accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT
);

-- ============================================================
-- System Configuration
-- ============================================================

CREATE TABLE system_config (
    key VARCHAR(255) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL,
    is_sensitive BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES users(id)
);

-- ============================================================
-- Functions & Triggers
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER tr_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER tr_departments_updated_at BEFORE UPDATE ON departments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER tr_roles_updated_at BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER tr_conversations_updated_at BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER tr_messages_updated_at BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER tr_collections_updated_at BEFORE UPDATE ON collections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER tr_documents_updated_at BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to increment conversation message count
CREATE OR REPLACE FUNCTION update_conversation_message_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE conversations
    SET message_count = message_count + 1,
        last_message_at = NEW.created_at
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_message_count AFTER INSERT ON messages FOR EACH ROW EXECUTE FUNCTION update_conversation_message_count();
