-- V021: Generic data classification tags + access enforcement
ALTER TABLE documents ADD COLUMN IF NOT EXISTS classification TEXT NOT NULL DEFAULT 'internal';
ALTER TABLE collections ADD COLUMN IF NOT EXISTS required_classification TEXT;
-- Standard levels: public < internal < confidential < restricted
CREATE INDEX IF NOT EXISTS idx_documents_classification ON documents(classification);
