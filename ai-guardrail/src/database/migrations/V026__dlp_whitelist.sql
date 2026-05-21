-- V026: DLP whitelist rules + contextual policies
CREATE TABLE IF NOT EXISTS dlp_whitelist_rules (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID,
    pattern_id     UUID,                            -- FK to dlp_patterns (NULL = applies to all)
    context_field  TEXT NOT NULL,                    -- e.g. "user_role", "department", "conversation_persona"
    context_value  TEXT NOT NULL,                    -- e.g. "admin", "legal", "security"
    effect         TEXT NOT NULL DEFAULT 'ALLOW',    -- ALLOW (suppress the violation) | ESCALATE
    description    TEXT,
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dwl_tenant ON dlp_whitelist_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dwl_pattern ON dlp_whitelist_rules(pattern_id);

-- Seed: admins and legal dept can see PII without triggering DLP block
INSERT INTO dlp_whitelist_rules (tenant_id, pattern_id, context_field, context_value, effect, description)
SELECT NULL, NULL, 'user_role', 'admin', 'ALLOW', 'Admins bypass DLP block (still logged)'
WHERE NOT EXISTS (SELECT 1 FROM dlp_whitelist_rules WHERE context_field='user_role' AND context_value='admin');
INSERT INTO dlp_whitelist_rules (tenant_id, pattern_id, context_field, context_value, effect, description)
SELECT NULL, NULL, 'department', 'legal', 'ALLOW', 'Legal dept can view PII for compliance'
WHERE NOT EXISTS (SELECT 1 FROM dlp_whitelist_rules WHERE context_field='department' AND context_value='legal');
