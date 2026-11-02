-- Analytics_Service fact projections (requirements 8.6, 14.10, 21.4, 21.5): ticket facts, daily aggregates, sign-in
-- activity facts, report schedules and runs, OKR targets, metric snapshots, guardrail flags and AI quality reports.
-- Fact tables carry no identity columns: no reporter, assignee, handler or user id and no free text. Sign-in activity
-- keeps a one-way actor key so distinct active users can be counted. Every table carries tenant_id and is protected by
-- forced row-level security with a restrictive tenant policy.

CREATE SCHEMA IF NOT EXISTS analytics;
GRANT USAGE ON SCHEMA analytics TO cc_owner, cc_app, cc_reader, cc_definer;

CREATE TABLE IF NOT EXISTS analytics.ticket_facts (
  tenant_id uuid NOT NULL,
  ticket_id uuid NOT NULL,
  department_id uuid,
  category_id uuid NOT NULL,
  band text NOT NULL CHECK (band IN ('P0', 'P1', 'P2', 'P3')),
  routed boolean NOT NULL DEFAULT false,
  reassigned_department boolean NOT NULL DEFAULT false,
  escalation_level smallint NOT NULL DEFAULT 0 CHECK (escalation_level BETWEEN 0 AND 3),
  resolved boolean NOT NULL DEFAULT false,
  closed boolean NOT NULL DEFAULT false,
  withdrawn boolean NOT NULL DEFAULT false,
  breached boolean NOT NULL DEFAULT false,
  resolved_within_sla boolean NOT NULL DEFAULT false,
  disputed boolean NOT NULL DEFAULT false,
  reopened boolean NOT NULL DEFAULT false,
  disputed_or_reopened_within_7d boolean NOT NULL DEFAULT false,
  first_response_hours numeric(10, 3) CHECK (first_response_hours >= 0),
  csat smallint CHECK (csat BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL,
  resolved_at timestamptz,
  closed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, ticket_id)
);
CREATE INDEX IF NOT EXISTS idx_ticket_facts_dims ON analytics.ticket_facts (tenant_id, department_id, category_id, band);
CREATE INDEX IF NOT EXISTS idx_ticket_facts_created ON analytics.ticket_facts (tenant_id, created_at);

CREATE TABLE IF NOT EXISTS analytics.daily_aggregates (
  tenant_id uuid NOT NULL,
  day date NOT NULL,
  -- The nil UUID stands for "no department".
  department_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  category_id uuid NOT NULL,
  band text NOT NULL CHECK (band IN ('P0', 'P1', 'P2', 'P3')),
  created integer NOT NULL DEFAULT 0 CHECK (created >= 0),
  routed integer NOT NULL DEFAULT 0 CHECK (routed >= 0),
  reassigned integer NOT NULL DEFAULT 0 CHECK (reassigned >= 0),
  escalated integer NOT NULL DEFAULT 0 CHECK (escalated >= 0),
  resolved integer NOT NULL DEFAULT 0 CHECK (resolved >= 0),
  closed integer NOT NULL DEFAULT 0 CHECK (closed >= 0),
  withdrawn integer NOT NULL DEFAULT 0 CHECK (withdrawn >= 0),
  breached integer NOT NULL DEFAULT 0 CHECK (breached >= 0),
  disputed integer NOT NULL DEFAULT 0 CHECK (disputed >= 0),
  reopened integer NOT NULL DEFAULT 0 CHECK (reopened >= 0),
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, day, department_id, category_id, band)
);

-- One row per actor per day. actor_key is sha256(tenant || user), so it cannot be turned back into a user.
CREATE TABLE IF NOT EXISTS analytics.signin_facts (
  tenant_id uuid NOT NULL,
  day date NOT NULL,
  actor_key bytea NOT NULL,
  role_class text NOT NULL CHECK (role_class IN ('student', 'staff')),
  first_ever boolean NOT NULL DEFAULT false,
  sign_ins integer NOT NULL DEFAULT 1 CHECK (sign_ins >= 1),
  PRIMARY KEY (tenant_id, day, actor_key)
);
CREATE INDEX IF NOT EXISTS idx_signin_facts_actor ON analytics.signin_facts (tenant_id, actor_key);

CREATE TABLE IF NOT EXISTS analytics.report_schedules (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  frequency text NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  format text NOT NULL CHECK (format IN ('pdf', 'csv')),
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  recipients uuid[] NOT NULL CHECK (cardinality(recipients) BETWEEN 1 AND 20),
  next_run_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_report_schedules_due ON analytics.report_schedules (next_run_at);

CREATE TABLE IF NOT EXISTS analytics.report_runs (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  outcome text NOT NULL DEFAULT 'running' CHECK (outcome IN ('running', 'succeeded', 'failed')),
  attempt integer NOT NULL DEFAULT 1 CHECK (attempt >= 1),
  object_key text,
  failure_reason text CHECK (length(failure_reason) <= 1000),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, schedule_id) REFERENCES analytics.report_schedules (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_report_runs_schedule ON analytics.report_runs (tenant_id, schedule_id, started_at DESC);

CREATE TABLE IF NOT EXISTS analytics.okr_targets (
  tenant_id uuid NOT NULL,
  metric_id text NOT NULL CHECK (length(metric_id) BETWEEN 1 AND 64),
  month smallint NOT NULL CHECK (month IN (3, 6, 12)),
  direction text NOT NULL CHECK (direction IN ('at_least', 'at_most')),
  target numeric NOT NULL,
  PRIMARY KEY (tenant_id, metric_id, month)
);

CREATE TABLE IF NOT EXISTS analytics.metric_snapshots (
  tenant_id uuid NOT NULL,
  id bigint GENERATED ALWAYS AS IDENTITY,
  metric_id text NOT NULL CHECK (length(metric_id) BETWEEN 1 AND 64),
  taken_on date NOT NULL,
  status text NOT NULL CHECK (status IN ('ok', 'insufficient_data', 'unavailable')),
  value numeric,
  n integer CHECK (n >= 0),
  denominator integer CHECK (denominator >= 0),
  reason text CHECK (length(reason) <= 200),
  target_status text CHECK (target_status IN ('met', 'not_met', 'insufficient_data', 'unavailable')),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, metric_id, taken_on)
);

CREATE TABLE IF NOT EXISTS analytics.guardrail_flags (
  tenant_id uuid NOT NULL,
  id bigint GENERATED ALWAYS AS IDENTITY,
  guardrail text NOT NULL CHECK (guardrail IN ('pii_exposure_incidents', 'p0_false_negative_rate', 'ai_override_rate', 'exposure_parity')),
  computed_on date NOT NULL,
  value numeric NOT NULL,
  threshold numeric,
  breached boolean NOT NULL,
  notified_at timestamptz,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, guardrail, computed_on)
);

CREATE TABLE IF NOT EXISTS analytics.ai_quality_reports (
  tenant_id uuid NOT NULL,
  id bigint GENERATED ALWAYS AS IDENTITY,
  report_date date NOT NULL,
  category_id uuid NOT NULL,
  suggestions integer NOT NULL CHECK (suggestions >= 0),
  accuracy numeric CHECK (accuracy BETWEEN 0 AND 1),
  calibration_error numeric CHECK (calibration_error >= 0),
  override_rate numeric CHECK (override_rate BETWEEN 0 AND 1),
  model_review_flag boolean NOT NULL DEFAULT false,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, report_date, category_id)
);

-- Reads the dimensions a fact needs. The projection consumer runs without a user, so it cannot read tickets directly.
CREATE OR REPLACE FUNCTION analytics.ticket_dims(p_ticket_id uuid)
RETURNS TABLE (
  department_id uuid,
  category_id uuid,
  band text,
  closure_reason text,
  rating smallint,
  created_at timestamptz,
  first_response_elapsed_sec integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, tickets, sla, app
AS $$
  SELECT t.department_id, t.category_id, t.band, t.closure_reason, t.rating, t.created_at, c.first_response_elapsed_sec
  FROM tickets.tickets t
  LEFT JOIN sla.sla_clocks c ON c.tenant_id = t.tenant_id AND c.ticket_id = t.id
  WHERE t.tenant_id = app.tenant() AND t.id = p_ticket_id
$$;

ALTER FUNCTION analytics.ticket_dims(uuid) OWNER TO cc_definer;
GRANT SELECT ON tickets.tickets, sla.sla_clocks TO cc_definer;
GRANT USAGE ON SCHEMA tickets, sla TO cc_definer;
REVOKE ALL ON FUNCTION analytics.ticket_dims(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.ticket_dims(uuid) TO cc_app;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ticket_facts', 'daily_aggregates', 'signin_facts', 'report_schedules', 'report_runs',
                           'okr_targets', 'metric_snapshots', 'guardrail_flags', 'ai_quality_reports']
  LOOP
    EXECUTE format('ALTER TABLE analytics.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE analytics.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON analytics.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON analytics.%I AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant())',
      t
    );
    EXECUTE format('DROP POLICY IF EXISTS app_access ON analytics.%I', t);
    EXECUTE format('CREATE POLICY app_access ON analytics.%I AS PERMISSIVE FOR ALL TO cc_app USING (true) WITH CHECK (true)', t);
    -- The reader serves dashboards and refreshes; it is also confined to the current Tenant.
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_reader ON analytics.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation_reader ON analytics.%I AS PERMISSIVE FOR SELECT TO cc_reader USING (tenant_id = app.tenant())',
      t
    );
    EXECUTE format('REVOKE ALL ON analytics.%I FROM PUBLIC', t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA analytics TO cc_app;
GRANT DELETE ON analytics.report_schedules, analytics.okr_targets TO cc_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA analytics TO cc_app;
GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO cc_reader;

-- RLS lint: explicit statements for static analysis
ALTER TABLE analytics.ticket_facts FORCE ROW LEVEL SECURITY;
ALTER TABLE analytics.daily_aggregates FORCE ROW LEVEL SECURITY;
ALTER TABLE analytics.signin_facts FORCE ROW LEVEL SECURITY;
ALTER TABLE analytics.report_schedules FORCE ROW LEVEL SECURITY;
ALTER TABLE analytics.report_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE analytics.okr_targets FORCE ROW LEVEL SECURITY;
ALTER TABLE analytics.metric_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE analytics.guardrail_flags FORCE ROW LEVEL SECURITY;
ALTER TABLE analytics.ai_quality_reports FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON analytics.ticket_facts;
CREATE POLICY tenant_isolation ON analytics.ticket_facts AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS tenant_isolation ON analytics.daily_aggregates;
CREATE POLICY tenant_isolation ON analytics.daily_aggregates AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS tenant_isolation ON analytics.signin_facts;
CREATE POLICY tenant_isolation ON analytics.signin_facts AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS tenant_isolation ON analytics.report_schedules;
CREATE POLICY tenant_isolation ON analytics.report_schedules AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS tenant_isolation ON analytics.report_runs;
CREATE POLICY tenant_isolation ON analytics.report_runs AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS tenant_isolation ON analytics.okr_targets;
CREATE POLICY tenant_isolation ON analytics.okr_targets AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS tenant_isolation ON analytics.metric_snapshots;
CREATE POLICY tenant_isolation ON analytics.metric_snapshots AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS tenant_isolation ON analytics.guardrail_flags;
CREATE POLICY tenant_isolation ON analytics.guardrail_flags AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS tenant_isolation ON analytics.ai_quality_reports;
CREATE POLICY tenant_isolation ON analytics.ai_quality_reports AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
