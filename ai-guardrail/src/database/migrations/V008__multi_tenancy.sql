CREATE TYPE tenant_status AS ENUM ('trial', 'active', 'suspended', 'cancelled');
CREATE TYPE tenant_tier AS ENUM ('starter', 'professional', 'enterprise');
CREATE TYPE isolation_level AS ENUM ('row', 'schema', 'database');

CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    tier tenant_tier NOT NULL DEFAULT 'starter',
    status tenant_status NOT NULL DEFAULT 'trial',
    isolation_level isolation_level NOT NULL DEFAULT 'row',
    owner_id UUID REFERENCES users(id),
    settings JSONB DEFAULT '{"timezone": "UTC", "locale": "en", "sessionTimeout": 3600, "mfaRequired": false}',
    features JSONB DEFAULT '{"ragEnabled": true, "memoryEnabled": true, "streamingEnabled": true, "multiModalEnabled": false, "agentsEnabled": false}',
    limits JSONB DEFAULT '{"maxUsers": 10, "maxStorage": 10737418240, "maxQueriesPerDay": 1000}',
    branding JSONB DEFAULT '{"primaryColor": "#3B82F6", "appName": "KYRA"}',
    custom_domain VARCHAR(255),
    encryption_key_id VARCHAR(255),
    trial_ends_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_status ON tenants(status);

-- Add tenant_id to key tables
ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE collections ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS tenant_id UUID;

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_conversations_tenant ON conversations(tenant_id);
CREATE INDEX idx_collections_tenant ON collections(tenant_id);

-- Row-Level Security policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- RLS policies (enforced when app connects as non-superuser)
CREATE POLICY tenant_users_policy ON users FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY tenant_conversations_policy ON conversations FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY tenant_collections_policy ON collections FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
