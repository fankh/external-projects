-- V029: Domain event store (append-only)
CREATE TABLE IF NOT EXISTS domain_events (
    id             BIGSERIAL PRIMARY KEY,
    event_id       UUID NOT NULL DEFAULT gen_random_uuid(),
    aggregate_type TEXT NOT NULL,          -- e.g. user, conversation, tenant, audit, breach
    aggregate_id   TEXT NOT NULL,
    event_type     TEXT NOT NULL,          -- e.g. user.created, conversation.message.sent
    version        INTEGER NOT NULL,
    payload        JSONB NOT NULL,
    metadata       JSONB,
    tenant_id      UUID,
    actor_id       UUID,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_de_aggregate ON domain_events(aggregate_type, aggregate_id);
CREATE INDEX IF NOT EXISTS idx_de_type ON domain_events(event_type);
CREATE INDEX IF NOT EXISTS idx_de_tenant ON domain_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_de_created ON domain_events(created_at DESC);

-- Ensure append-only: trigger blocks UPDATE/DELETE
CREATE OR REPLACE FUNCTION domain_events_immutable() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'domain_events is append-only; mutations blocked';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_domain_events_immutable ON domain_events;
CREATE TRIGGER trg_domain_events_immutable
    BEFORE UPDATE OR DELETE ON domain_events
    FOR EACH ROW EXECUTE FUNCTION domain_events_immutable();
