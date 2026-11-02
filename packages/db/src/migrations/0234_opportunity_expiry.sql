-- Opportunity expiry (requirement 10.13) and embedding retry state (10.14).

ALTER TABLE opps.opportunities ADD COLUMN IF NOT EXISTS expired_at timestamptz;
ALTER TABLE opps.opportunities ADD COLUMN IF NOT EXISTS embedding_attempts integer NOT NULL DEFAULT 0 CHECK (embedding_attempts >= 0);
ALTER TABLE opps.opportunities ADD COLUMN IF NOT EXISTS embedding_next_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_opportunities_embedding_retry
  ON opps.opportunities (tenant_id, embedding_next_at) WHERE embedding_next_at IS NOT NULL;
