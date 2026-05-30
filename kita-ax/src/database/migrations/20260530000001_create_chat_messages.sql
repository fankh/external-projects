-- Migration: Create ChatMessage table
-- Purpose: Store chat conversation messages between users and assistants

-- Up: Create ChatMessage table
CREATE TABLE IF NOT EXISTS "ChatMessages" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "role" VARCHAR(50) NOT NULL CHECK ("role" IN ('user', 'assistant')),
  "content" TEXT NOT NULL,
  "userId" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE CASCADE,
  FOREIGN KEY ("tenantId") REFERENCES "Users"("tenantId") ON DELETE CASCADE
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS "idx_ChatMessages_tenantId" ON "ChatMessages"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_ChatMessages_userId" ON "ChatMessages"("userId");
CREATE INDEX IF NOT EXISTS "idx_ChatMessages_role" ON "ChatMessages"("role");
CREATE INDEX IF NOT EXISTS "idx_ChatMessages_createdAt" ON "ChatMessages"("createdAt");
CREATE INDEX IF NOT EXISTS "idx_ChatMessages_tenantId_createdAt" ON "ChatMessages"("tenantId", "createdAt");

-- Down: Drop ChatMessage table and indexes
DROP INDEX IF EXISTS "idx_ChatMessages_tenantId_createdAt";
DROP INDEX IF EXISTS "idx_ChatMessages_createdAt";
DROP INDEX IF EXISTS "idx_ChatMessages_role";
DROP INDEX IF EXISTS "idx_ChatMessages_userId";
DROP INDEX IF EXISTS "idx_ChatMessages_tenantId";
DROP TABLE IF EXISTS "ChatMessages";
