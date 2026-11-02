-- Privacy, consent and data subject rights (requirements 19.1 to 19.5, 19.7, 19.9, 19.10): per-purpose consent with
-- timestamps, DSR requests with a 30-day due date, Tenant retention policies and breach notification records.
-- Every table carries tenant_id and is protected by forced row-level security with a restrictive tenant policy.

CREATE SCHEMA IF NOT EXISTS privacy;
GRANT USAGE ON SCHEMA privacy TO cc_owner, cc_app, cc_reader, cc_definer;

CREATE TABLE IF NOT EXISTS privacy.consent_purposes (
  tenant_id uuid NOT NULL,
  purpose text NOT NULL CHECK (purpose ~ '^[a-z][a-z0-9_]{1,63}$'),
  description text NOT NULL CHECK (length(description) BETWEEN 1 AND 1000),
  -- Version of the privacy notice that describes this purpose.
  notice_version integer NOT NULL DEFAULT 1 CHECK (notice_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, purpose),
  FOREIGN KEY (tenant_id) REFERENCES core.tenants (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS privacy.consents (
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  purpose text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('granted', 'declined', 'withdrawn')),
  notice_version integer NOT NULL DEFAULT 1 CHECK (notice_version >= 1),
  decided_at timestamptz NOT NULL DEFAULT now(),
  -- Set when a consent is withdrawn; kept as the record of the withdrawal (19.2).
  withdrawn_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id, purpose),
  FOREIGN KEY (tenant_id, user_id) REFERENCES core.users (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, purpose) REFERENCES privacy.consent_purposes (tenant_id, purpose),
  CHECK ((decision = 'withdrawn') = (withdrawn_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_consents_purpose ON privacy.consents (tenant_id, purpose, decision);

-- Append-only history of every decision, so a withdrawal stays on record after a later re-grant.
CREATE TABLE IF NOT EXISTS privacy.consent_events (
  tenant_id uuid NOT NULL,
  id bigint GENERATED ALWAYS AS IDENTITY,
  user_id uuid NOT NULL,
  purpose text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('granted', 'declined', 'withdrawn')),
  at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, user_id) REFERENCES core.users (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_consent_events_user ON privacy.consent_events (tenant_id, user_id, at DESC);

CREATE TABLE IF NOT EXISTS privacy.dsr_requests (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('export', 'erasure')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'failed')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  completed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  failure_reason text CHECK (length(failure_reason) <= 1000),
  -- Set once the Student was told the request missed its due date (19.9).
  late_notified_at timestamptz,
  -- Machine-readable export (19.3); null for erasure requests.
  export_payload jsonb,
  -- Categories kept after erasure with the reason (19.4).
  retained_categories jsonb,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, user_id) REFERENCES core.users (tenant_id, id) ON DELETE CASCADE,
  CHECK ((status = 'completed') = (completed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_dsr_user ON privacy.dsr_requests (tenant_id, user_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_dsr_due ON privacy.dsr_requests (tenant_id, due_at) WHERE status <> 'completed';
-- One unfinished request of each kind per Student.
CREATE UNIQUE INDEX IF NOT EXISTS uq_dsr_unfinished
  ON privacy.dsr_requests (tenant_id, user_id, kind) WHERE status <> 'completed';

CREATE TABLE IF NOT EXISTS privacy.retention_policies (
  tenant_id uuid NOT NULL,
  item_type text NOT NULL CHECK (length(item_type) BETWEEN 1 AND 64),
  retain_days integer NOT NULL CHECK (retain_days >= 1),
  action text NOT NULL DEFAULT 'delete' CHECK (action IN ('delete', 'anonymise')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, item_type),
  FOREIGN KEY (tenant_id) REFERENCES core.tenants (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS privacy.retention_runs (
  tenant_id uuid NOT NULL,
  id bigint GENERATED ALWAYS AS IDENTITY,
  item_type text NOT NULL,
  ran_at timestamptz NOT NULL DEFAULT now(),
  disposed integer NOT NULL DEFAULT 0 CHECK (disposed >= 0),
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS privacy.breaches (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  -- Shared by the rows of one declaration across Tenants.
  declaration_id uuid NOT NULL,
  nature text NOT NULL CHECK (length(nature) BETWEEN 1 AND 2000),
  data_categories text[] NOT NULL CHECK (cardinality(data_categories) >= 1),
  approximate_students integer NOT NULL CHECK (approximate_students >= 0),
  detected_at timestamptz NOT NULL,
  declared_at timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz,
  admins_notified integer NOT NULL DEFAULT 0 CHECK (admins_notified >= 0),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES core.tenants (id) ON DELETE CASCADE
);

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['consent_purposes', 'consents', 'consent_events', 'dsr_requests', 'retention_policies',
                           'retention_runs', 'breaches']
  LOOP
    EXECUTE format('ALTER TABLE privacy.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE privacy.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON privacy.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON privacy.%I AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant())',
      t
    );
    EXECUTE format('DROP POLICY IF EXISTS app_access ON privacy.%I', t);
    EXECUTE format('CREATE POLICY app_access ON privacy.%I AS PERMISSIVE FOR ALL TO cc_app USING (true) WITH CHECK (true)', t);
    EXECUTE format('REVOKE ALL ON privacy.%I FROM PUBLIC', t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE ON privacy.consent_purposes, privacy.consents, privacy.dsr_requests,
  privacy.retention_policies, privacy.breaches TO cc_app;
GRANT SELECT, INSERT ON privacy.consent_events, privacy.retention_runs TO cc_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA privacy TO cc_app;
GRANT SELECT ON ALL TABLES IN SCHEMA privacy TO cc_reader;

-- RLS lint: explicit statements for static analysis
ALTER TABLE privacy.consent_purposes FORCE ROW LEVEL SECURITY;
ALTER TABLE privacy.consents FORCE ROW LEVEL SECURITY;
ALTER TABLE privacy.consent_events FORCE ROW LEVEL SECURITY;
ALTER TABLE privacy.dsr_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE privacy.retention_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE privacy.retention_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE privacy.breaches FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON privacy.consent_purposes;
CREATE POLICY tenant_isolation ON privacy.consent_purposes AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS tenant_isolation ON privacy.consents;
CREATE POLICY tenant_isolation ON privacy.consents AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS tenant_isolation ON privacy.consent_events;
CREATE POLICY tenant_isolation ON privacy.consent_events AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS tenant_isolation ON privacy.dsr_requests;
CREATE POLICY tenant_isolation ON privacy.dsr_requests AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS tenant_isolation ON privacy.retention_policies;
CREATE POLICY tenant_isolation ON privacy.retention_policies AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS tenant_isolation ON privacy.retention_runs;
CREATE POLICY tenant_isolation ON privacy.retention_runs AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS tenant_isolation ON privacy.breaches;
CREATE POLICY tenant_isolation ON privacy.breaches AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
