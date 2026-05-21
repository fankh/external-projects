-- Feedback aggregates table for pre-computed daily analytics
CREATE TABLE IF NOT EXISTS feedback_aggregates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    date            DATE NOT NULL,
    persona_id      UUID,
    model_id        VARCHAR(255),
    positive_count  BIGINT NOT NULL DEFAULT 0,
    negative_count  BIGINT NOT NULL DEFAULT 0,
    reason_counts   JSONB DEFAULT '{}',

    CONSTRAINT uq_feedback_aggregate UNIQUE (tenant_id, date, persona_id, model_id)
);

CREATE INDEX idx_feedback_agg_date ON feedback_aggregates (date);
CREATE INDEX idx_feedback_agg_tenant_date ON feedback_aggregates (tenant_id, date);
CREATE INDEX idx_feedback_agg_persona ON feedback_aggregates (persona_id);
CREATE INDEX idx_feedback_agg_model ON feedback_aggregates (model_id);
