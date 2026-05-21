-- V018: User Behavior Analytics — per-user baseline profile + anomaly log

CREATE TABLE IF NOT EXISTS user_behavior_profiles (
    user_id              UUID PRIMARY KEY,
    tenant_id            UUID,
    hour_histogram       INTEGER[] NOT NULL DEFAULT array_fill(0, ARRAY[24]),
    total_observations   INTEGER NOT NULL DEFAULT 0,
    known_ip_hashes      TEXT[] NOT NULL DEFAULT '{}',   -- SHA-256 of IPs
    known_ua_hashes      TEXT[] NOT NULL DEFAULT '{}',   -- SHA-256 of user-agents
    last_observed_at     TIMESTAMPTZ,
    avg_logins_per_day   DOUBLE PRECISION NOT NULL DEFAULT 0,
    stddev_logins        DOUBLE PRECISION NOT NULL DEFAULT 0,
    risk_score           INTEGER NOT NULL DEFAULT 0,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ubp_tenant ON user_behavior_profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ubp_risk ON user_behavior_profiles(risk_score DESC);

CREATE TABLE IF NOT EXISTS user_anomalies (
    id                UUID PRIMARY KEY,
    tenant_id         UUID,
    user_id           UUID NOT NULL,
    anomaly_type      TEXT NOT NULL,               -- NEW_IP | NEW_DEVICE | OFF_HOURS | VOLUME_SPIKE | IMPOSSIBLE_TRAVEL
    severity          TEXT NOT NULL,               -- LOW | MEDIUM | HIGH | CRITICAL
    risk_delta        INTEGER NOT NULL,
    details           JSONB,
    detected_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged      BOOLEAN NOT NULL DEFAULT FALSE,
    acknowledged_by   UUID,
    acknowledged_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_anomalies_user ON user_anomalies(user_id);
CREATE INDEX IF NOT EXISTS idx_anomalies_tenant_severity ON user_anomalies(tenant_id, severity);
CREATE INDEX IF NOT EXISTS idx_anomalies_unack ON user_anomalies(acknowledged) WHERE acknowledged = FALSE;
CREATE INDEX IF NOT EXISTS idx_anomalies_recent ON user_anomalies(detected_at DESC);
