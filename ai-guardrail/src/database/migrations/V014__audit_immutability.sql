-- V011: Audit log immutability
-- Adds hash chain (prev_hash / entry_hash) for tamper detection and legal_hold flag.
-- A trigger blocks UPDATE/DELETE on rows under legal hold.

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS prev_hash  CHAR(64);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entry_hash CHAR(64);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS legal_hold BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_audit_legal_hold ON audit_logs(legal_hold) WHERE legal_hold;

-- Backfill: for existing rows, mark chain-genesis so verifyChain starts clean after migration.
-- We set entry_hash = sha256(id::text) and leave prev_hash NULL. New entries link from here.
UPDATE audit_logs
   SET entry_hash = encode(digest(id::text, 'sha256'), 'hex')
 WHERE entry_hash IS NULL;

-- Trigger to block mutations on legal-hold rows
CREATE OR REPLACE FUNCTION audit_logs_guard() RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') AND OLD.legal_hold = TRUE THEN
    RAISE EXCEPTION 'Audit log row % is under legal hold; mutation blocked', OLD.id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_logs_guard ON audit_logs;
CREATE TRIGGER trg_audit_logs_guard
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_guard();
