-- V016: GDPR Art.33/34 — Breach notification register
-- Records personal-data breaches; tracks 72-hour authority notification and
-- high-risk subject notification deadlines.

CREATE TABLE IF NOT EXISTS breach_incidents (
    id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                  UUID,
    detected_at                TIMESTAMPTZ NOT NULL,
    reported_by                UUID,                             -- admin user who filed
    severity                   TEXT NOT NULL,                    -- LOW | MEDIUM | HIGH | CRITICAL
    category                   TEXT NOT NULL,                    -- CONFIDENTIALITY | INTEGRITY | AVAILABILITY
    affected_record_count      INTEGER NOT NULL DEFAULT 0,
    affected_data_categories   TEXT[] NOT NULL DEFAULT '{}',     -- e.g. {email,name,ip_address}
    description                TEXT NOT NULL,
    root_cause                 TEXT,
    containment_actions        TEXT,
    high_risk_to_subjects      BOOLEAN NOT NULL DEFAULT FALSE,
    authority_deadline_at      TIMESTAMPTZ NOT NULL,             -- detected_at + 72h
    authority_notified_at      TIMESTAMPTZ,
    authority_notification_ref TEXT,                             -- reference number from DPA
    subjects_notified_at       TIMESTAMPTZ,
    subjects_notification_count INTEGER,
    status                     TEXT NOT NULL DEFAULT 'OPEN',   -- OPEN | UNDER_INVESTIGATION | NOTIFIED | CLOSED
    metadata                   JSONB,
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_breach_tenant ON breach_incidents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_breach_status ON breach_incidents(status);
CREATE INDEX IF NOT EXISTS idx_breach_auth_deadline ON breach_incidents(authority_deadline_at) WHERE authority_notified_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_breach_detected ON breach_incidents(detected_at DESC);
