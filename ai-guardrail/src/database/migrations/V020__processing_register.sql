-- V020: GDPR Art.30 Processing Activity Register
-- Documents each processing activity (data flow): purpose, categories of data,
-- recipients, retention, security measures.

CREATE TABLE IF NOT EXISTS processing_activities (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                UUID,
    name                     TEXT NOT NULL,
    description              TEXT,
    purpose                  TEXT NOT NULL,
    legal_basis              TEXT NOT NULL,         -- consent | contract | legal_obligation | vital_interests | public_task | legitimate_interests
    data_categories          TEXT[] NOT NULL DEFAULT '{}',  -- e.g. {personal_identifiers, contact_data, account_data}
    data_subject_categories  TEXT[] NOT NULL DEFAULT '{}',  -- e.g. {employees, customers, prospects}
    recipients               TEXT[] NOT NULL DEFAULT '{}',  -- e.g. {OpenAI, Stripe, internal_only}
    third_country_transfers  TEXT[] NOT NULL DEFAULT '{}',  -- destination countries
    retention_period_days    INTEGER,
    security_measures        TEXT,
    dpo_contact              TEXT,
    automated                BOOLEAN NOT NULL DEFAULT TRUE,
    last_reviewed_at         TIMESTAMPTZ,
    metadata                 JSONB,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_par_tenant ON processing_activities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_par_purpose ON processing_activities(purpose);
CREATE INDEX IF NOT EXISTS idx_par_legal ON processing_activities(legal_basis);

-- Seed standard processing activities every KYRA tenant has by default
INSERT INTO processing_activities (id, tenant_id, name, purpose, legal_basis, data_categories, data_subject_categories, recipients, third_country_transfers, retention_period_days, security_measures, automated, last_reviewed_at)
SELECT gen_random_uuid(), NULL, v.name, v.purpose, v.basis, v.cats, v.subj, v.recip, v.countries, v.retention, v.measures, TRUE, NOW()
FROM (VALUES
  ('Authentication', 'User login + session management', 'contract',
    ARRAY['personal_identifiers','account_data','ip_address','device_data'],
    ARRAY['end_users','administrators'],
    ARRAY['internal_only'],
    ARRAY[]::text[],
    365, 'Bcrypt password hashing, MFA/TOTP, JWT, audit log'),
  ('Conversation history', 'Store chat conversations for user reference', 'contract',
    ARRAY['content_data','usage_data'],
    ARRAY['end_users'],
    ARRAY['OpenAI','Anthropic','Azure OpenAI'],
    ARRAY['US'],
    730, 'Encryption at rest, RLS by tenant, DLP scan on input'),
  ('RAG document indexing', 'Index uploaded documents for retrieval', 'contract',
    ARRAY['content_data'],
    ARRAY['end_users','document_owners'],
    ARRAY['internal_only'],
    ARRAY[]::text[],
    NULL, 'Vector store with tenant scoping, encrypted blobs in MinIO'),
  ('Audit logging', 'Compliance audit trail of user + admin actions', 'legal_obligation',
    ARRAY['personal_identifiers','ip_address','action_metadata'],
    ARRAY['end_users','administrators'],
    ARRAY['internal_only','SIEM (if configured)'],
    ARRAY[]::text[],
    2555, 'Hash-chain immutability, legal-hold trigger, append-only'),
  ('Billing', 'Subscription + invoice management', 'contract',
    ARRAY['billing_address','payment_method_token','usage_data'],
    ARRAY['tenant_admins'],
    ARRAY['Stripe'],
    ARRAY['US'],
    2555, 'Stripe-tokenized payment methods, no raw card data stored'),
  ('Threat detection (UBA)', 'Detect anomalous user behavior', 'legitimate_interests',
    ARRAY['login_metadata','ip_address_hashed','ua_hashed'],
    ARRAY['end_users'],
    ARRAY['internal_only'],
    ARRAY[]::text[],
    365, 'SHA-256 hashing of IPs/UAs, anomaly scoring with threshold')
) AS v(name, purpose, basis, cats, subj, recip, countries, retention, measures)
ON CONFLICT DO NOTHING;
