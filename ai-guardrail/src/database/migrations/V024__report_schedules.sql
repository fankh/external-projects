-- V024: Scheduled report generation
CREATE TABLE IF NOT EXISTS report_schedules (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID,
    name          TEXT NOT NULL,
    report_type   TEXT NOT NULL,        -- compliance_status | usage_summary | security_events | audit_export
    cron_expr     TEXT NOT NULL DEFAULT '0 6 * * 1',  -- weekly Monday 06:00
    format        TEXT NOT NULL DEFAULT 'json',        -- json | csv | markdown
    enabled       BOOLEAN NOT NULL DEFAULT TRUE,
    last_run_at   TIMESTAMPTZ,
    next_run_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS generated_reports (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id   UUID,
    tenant_id     UUID,
    report_type   TEXT NOT NULL,
    format        TEXT NOT NULL,
    file_path     TEXT,
    size_bytes    BIGINT,
    generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_rs_enabled ON report_schedules(enabled) WHERE enabled;
CREATE INDEX IF NOT EXISTS idx_gr_tenant ON generated_reports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_gr_recent ON generated_reports(generated_at DESC);
