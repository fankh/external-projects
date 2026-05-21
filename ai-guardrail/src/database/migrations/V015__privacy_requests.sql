-- V015: GDPR Data Subject Rights (DSR) — privacy request lifecycle
-- Implements Art.15 access, Art.17 erasure, Art.18 restriction, Art.20 portability.

CREATE TABLE IF NOT EXISTS privacy_requests (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          UUID,
    user_id            UUID NOT NULL,                    -- subject
    type               TEXT NOT NULL,                    -- EXPORT | ERASURE | RESTRICTION | ACCESS
    status             TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
                                                         -- PENDING_VERIFICATION | VERIFIED | IN_PROGRESS
                                                         -- COMPLETED | REJECTED | CANCELLED
    requested_by       UUID,                             -- user themselves OR admin-on-behalf
    verification_notes TEXT,
    verified_by        UUID,
    verified_at        TIMESTAMPTZ,
    fulfilled_by       UUID,
    fulfilled_at       TIMESTAMPTZ,
    sla_deadline_at    TIMESTAMPTZ NOT NULL,             -- 30 days from creation per Art.12(3)
    hard_delete_at     TIMESTAMPTZ,                      -- for ERASURE: cutoff after 30-day hold
    export_url         TEXT,                             -- internal S3/path for EXPORT downloads
    export_size_bytes  BIGINT,
    rejection_reason   TEXT,
    metadata           JSONB,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_privacy_user ON privacy_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_privacy_tenant ON privacy_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_privacy_status ON privacy_requests(status);
CREATE INDEX IF NOT EXISTS idx_privacy_deadline ON privacy_requests(sla_deadline_at) WHERE status IN ('PENDING_VERIFICATION', 'VERIFIED', 'IN_PROGRESS');
CREATE INDEX IF NOT EXISTS idx_privacy_hard_delete ON privacy_requests(hard_delete_at) WHERE hard_delete_at IS NOT NULL;

-- Add deletion_requested_at flag to users so we can detect restricted accounts fast
ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_restricted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ;

-- Allow PENDING_DELETION status (text column per earlier migration)
-- users.status is already TEXT after V012 conversions; no alter needed.
