CREATE TABLE sso_configurations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    provider_type VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    config JSONB NOT NULL DEFAULT '{}',
    metadata_url VARCHAR(500),
    entity_id VARCHAR(500),
    certificate TEXT,
    client_id VARCHAR(255),
    client_secret VARCHAR(255),
    authorization_url VARCHAR(500),
    token_url VARCHAR(500),
    userinfo_url VARCHAR(500),
    scopes TEXT[] DEFAULT '{openid,profile,email}',
    attribute_mapping JSONB DEFAULT '{"email": "email", "name": "name", "groups": "groups"}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, provider_type)
);
CREATE INDEX idx_sso_tenant ON sso_configurations(tenant_id);
