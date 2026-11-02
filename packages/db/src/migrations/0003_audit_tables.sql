-- Audit_Log storage (requirement 18): pending queue, monthly-partitioned append-only log, per-tenant chain head.
-- Entries are recorded into audit_pending inside the caller's transaction, then chained into audit_log by the chainer.

-- Entries awaiting chaining. A NULL actor means the system acted.
CREATE TABLE IF NOT EXISTS audit.audit_pending (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  actor uuid,
  action text NOT NULL,
  target text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('success', 'failure')),
  details jsonb, -- ids, codes and redacted text only (G4)
  timestamp_ms bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_pending_tenant_created
  ON audit.audit_pending (tenant_id, created_at, id);

ALTER TABLE audit.audit_pending ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_pending_select ON audit.audit_pending
  FOR SELECT TO cc_app USING (tenant_id = app.tenant());
CREATE POLICY audit_pending_insert ON audit.audit_pending
  FOR INSERT TO cc_app WITH CHECK (tenant_id = app.tenant());
-- The chainer removes rows once they are in audit_log. Rows are never updated.
CREATE POLICY audit_pending_delete ON audit.audit_pending
  FOR DELETE TO cc_app USING (tenant_id = app.tenant());

-- The append-only log, partitioned by month.
CREATE TABLE IF NOT EXISTS audit.audit_log (
  id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  actor uuid,
  action text NOT NULL,
  target text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('success', 'failure')),
  details jsonb,
  timestamp_ms bigint NOT NULL,
  hash text NOT NULL, -- SHA-256 hex over the entry and the previous hash
  seq_num bigint NOT NULL, -- position in the tenant's chain, starting at 1
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, created_at, id)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_seq
  ON audit.audit_log (tenant_id, seq_num);
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_timestamp
  ON audit.audit_log (tenant_id, timestamp_ms DESC);

-- Creates the partitions for the previous month through `months_ahead` months from now.
-- SECURITY DEFINER so the application role can keep partitions available without owning the table.
CREATE OR REPLACE FUNCTION audit.ensure_partitions(months_ahead integer DEFAULT 2)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, audit
AS $$
DECLARE
  partition_start timestamptz;
BEGIN
  FOR i IN -1..months_ahead LOOP
    partition_start := date_trunc('month', now() + make_interval(months => i));
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS audit.%I PARTITION OF audit.audit_log FOR VALUES FROM (%L) TO (%L)',
      'audit_log_' || to_char(partition_start, 'YYYY_MM'),
      partition_start,
      partition_start + interval '1 month'
    );
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION audit.ensure_partitions(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit.ensure_partitions(integer) TO cc_app;

SELECT audit.ensure_partitions(2);

ALTER TABLE audit.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_log_select ON audit.audit_log
  FOR SELECT TO cc_app USING (tenant_id = app.tenant());
CREATE POLICY audit_log_insert ON audit.audit_log
  FOR INSERT TO cc_app WITH CHECK (tenant_id = app.tenant());

-- Reject UPDATE, DELETE and TRUNCATE for every role, including the owner and superusers.
CREATE OR REPLACE FUNCTION audit.audit_log_reject_modify()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER audit_log_reject_update
  BEFORE UPDATE ON audit.audit_log
  FOR EACH ROW EXECUTE FUNCTION audit.audit_log_reject_modify();
CREATE TRIGGER audit_log_reject_delete
  BEFORE DELETE ON audit.audit_log
  FOR EACH ROW EXECUTE FUNCTION audit.audit_log_reject_modify();
CREATE TRIGGER audit_log_reject_truncate
  BEFORE TRUNCATE ON audit.audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit.audit_log_reject_modify();

-- Head of each tenant's chain, plus the last anchor written to the S3 Object Lock bucket.
CREATE TABLE IF NOT EXISTS audit.audit_chain_head (
  tenant_id uuid PRIMARY KEY,
  last_entry_id uuid NOT NULL,
  last_hash text NOT NULL,
  last_seq_num bigint NOT NULL,
  anchored_seq_num bigint,
  anchored_at timestamptz,
  anchor_location text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE audit.audit_chain_head ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_chain_head_tenant ON audit.audit_chain_head
  FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());

-- cc_app may only INSERT and SELECT audit rows. The chain head is a pointer and may be updated.
REVOKE ALL ON audit.audit_pending, audit.audit_log, audit.audit_chain_head FROM PUBLIC;
GRANT SELECT, INSERT, DELETE ON audit.audit_pending TO cc_app;
GRANT SELECT, INSERT ON audit.audit_log TO cc_app;
GRANT SELECT, INSERT, UPDATE ON audit.audit_chain_head TO cc_app;
GRANT SELECT ON audit.audit_log TO cc_reader;

-- RLS lint: explicit statements for static analysis
ALTER TABLE audit.audit_pending FORCE ROW LEVEL SECURITY;
ALTER TABLE audit.audit_log FORCE ROW LEVEL SECURITY;
ALTER TABLE audit.audit_chain_head FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit.audit_pending AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
CREATE POLICY tenant_isolation ON audit.audit_log AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
