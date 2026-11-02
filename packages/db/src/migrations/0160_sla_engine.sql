-- SLA_Engine tables (requirements 4.4, 4.5, 6.1, 6.2, 6.8, 6.9, 6.12): clocks, running segments, pauses and
-- escalations. Every table carries tenant_id, leads its indexes with it and is protected by forced row-level
-- security with a restrictive tenant policy. The SLA consumer runs without a user, so it reads and updates the
-- Ticket's SLA columns only through the SECURITY DEFINER functions below, which stay inside the current Tenant.

CREATE SCHEMA IF NOT EXISTS sla;
GRANT USAGE ON SCHEMA sla TO cc_owner, cc_app, cc_reader, cc_definer;

CREATE TABLE IF NOT EXISTS sla.sla_clocks (
  tenant_id uuid NOT NULL,
  ticket_id uuid NOT NULL,
  mode text NOT NULL CHECK (mode IN ('working', 'continuous')),
  band text NOT NULL CHECK (band IN ('P0', 'P1', 'P2', 'P3')),
  state text NOT NULL CHECK (state IN ('running', 'paused', 'stopped')),
  first_response_sec integer NOT NULL CHECK (first_response_sec >= 0),
  resolution_sec integer NOT NULL CHECK (resolution_sec >= 0),
  l1_sec integer NOT NULL CHECK (l1_sec >= 0),
  l2_sec integer NOT NULL CHECK (l2_sec >= 0),
  carried_sec integer NOT NULL DEFAULT 0 CHECK (carried_sec >= 0),
  -- First public Handler message (6.8). Elapsed seconds are exact; minutes are the reported whole number.
  first_response_at timestamptz,
  first_response_elapsed_sec integer CHECK (first_response_elapsed_sec >= 0),
  first_response_min integer CHECK (first_response_min >= 0),
  first_response_met boolean,
  -- Event facts that drive the non-clock timers.
  awaiting_student_since timestamptz,
  resolved_at timestamptz,
  l3_escalated_at timestamptz,
  -- Cached due columns, null while the clock is paused or stopped.
  first_response_due_at timestamptz,
  at_risk_at timestamptz,
  resolution_due_at timestamptz,
  generation integer NOT NULL DEFAULT 1 CHECK (generation >= 1),
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, ticket_id)
);
CREATE INDEX IF NOT EXISTS idx_sla_clocks_due ON sla.sla_clocks (tenant_id, state, resolution_due_at);

-- Running intervals. Gaps between segments are pauses.
CREATE TABLE IF NOT EXISTS sla.sla_segments (
  tenant_id uuid NOT NULL,
  ticket_id uuid NOT NULL,
  seq integer NOT NULL CHECK (seq >= 0),
  start_at timestamptz NOT NULL,
  end_at timestamptz,
  PRIMARY KEY (tenant_id, ticket_id, seq),
  CHECK (end_at IS NULL OR end_at >= start_at),
  FOREIGN KEY (tenant_id, ticket_id) REFERENCES sla.sla_clocks (tenant_id, ticket_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sla.sla_pauses (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL,
  paused_at timestamptz NOT NULL,
  resumed_at timestamptz,
  -- Wall-clock seconds between pause and resume (4.4, 4.5); null while paused.
  paused_sec integer CHECK (paused_sec >= 0),
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 64),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, ticket_id) REFERENCES sla.sla_clocks (tenant_id, ticket_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sla_pauses_ticket ON sla.sla_pauses (tenant_id, ticket_id, paused_at);

CREATE TABLE IF NOT EXISTS sla.escalations (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL,
  level smallint NOT NULL CHECK (level BETWEEN 1 AND 3),
  escalated_at timestamptz NOT NULL DEFAULT now(),
  target_role text NOT NULL CHECK (target_role IN ('handler', 'dept_head', 'ombudsperson')),
  target_user_id uuid,
  review_due_at timestamptz,
  overdue boolean NOT NULL DEFAULT false,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, ticket_id, level, escalated_at),
  FOREIGN KEY (tenant_id, ticket_id) REFERENCES tickets.tickets (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_escalations_ticket ON sla.escalations (tenant_id, ticket_id, level);

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sla_clocks', 'sla_segments', 'sla_pauses', 'escalations']
  LOOP
    EXECUTE format('ALTER TABLE sla.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE sla.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON sla.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON sla.%I AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant())',
      t
    );
    EXECUTE format('DROP POLICY IF EXISTS tenant_access ON sla.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_access ON sla.%I AS PERMISSIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant())',
      t
    );
    EXECUTE format('REVOKE ALL ON sla.%I FROM PUBLIC', t);
  END LOOP;
END $$;

-- Staff read clocks and escalations of Tickets they can see; the Student never reads internal SLA state.
GRANT SELECT, INSERT, UPDATE ON sla.sla_clocks TO cc_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON sla.sla_segments TO cc_app;
GRANT SELECT, INSERT, UPDATE ON sla.sla_pauses TO cc_app;
GRANT SELECT, INSERT, UPDATE ON sla.escalations TO cc_app;
GRANT SELECT ON ALL TABLES IN SCHEMA sla TO cc_reader;

-- System access to the Ticket's SLA columns for the definer role, bounded to the current Tenant.
GRANT USAGE ON SCHEMA tickets TO cc_definer;
GRANT SELECT, UPDATE ON tickets.tickets TO cc_definer;
DROP POLICY IF EXISTS sla_engine ON tickets.tickets;
CREATE POLICY sla_engine ON tickets.tickets AS PERMISSIVE FOR ALL TO cc_definer
  USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());

CREATE OR REPLACE FUNCTION sla.ticket_facts(p_ticket_id uuid)
RETURNS TABLE (
  band text,
  status text,
  category_id uuid,
  department_id uuid,
  assignee_id uuid,
  escalation_level smallint,
  is_open boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, tickets, app
AS $$
  SELECT t.band, t.status, t.category_id, t.department_id, t.assignee_id, t.escalation_level, t.is_open
  FROM tickets.tickets t
  WHERE t.tenant_id = app.tenant() AND t.id = p_ticket_id
$$;

-- Writes the cached sort key and the slaUnconfigured flag (6.12). A null sort key clears it.
CREATE OR REPLACE FUNCTION sla.set_ticket_sla(p_ticket_id uuid, p_sort_due_at timestamptz, p_unconfigured boolean)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, tickets, app
AS $$
  UPDATE tickets.tickets t
  SET sort_due_at = p_sort_due_at,
      flags = CASE WHEN p_unconfigured THEN t.flags || '{"slaUnconfigured": true}'::jsonb
                   ELSE t.flags - 'slaUnconfigured' END,
      updated_at = now()
  WHERE t.tenant_id = app.tenant() AND t.id = p_ticket_id
$$;

ALTER FUNCTION sla.ticket_facts(uuid) OWNER TO cc_definer;
ALTER FUNCTION sla.set_ticket_sla(uuid, timestamptz, boolean) OWNER TO cc_definer;
GRANT USAGE ON SCHEMA sla TO cc_definer;
REVOKE ALL ON FUNCTION sla.ticket_facts(uuid), sla.set_ticket_sla(uuid, timestamptz, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sla.ticket_facts(uuid), sla.set_ticket_sla(uuid, timestamptz, boolean) TO cc_app;

-- RLS lint: explicit statements for static analysis
ALTER TABLE sla.sla_clocks FORCE ROW LEVEL SECURITY;
ALTER TABLE sla.sla_segments FORCE ROW LEVEL SECURITY;
ALTER TABLE sla.sla_pauses FORCE ROW LEVEL SECURITY;
ALTER TABLE sla.escalations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sla.sla_clocks;
CREATE POLICY tenant_isolation ON sla.sla_clocks AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS tenant_isolation ON sla.sla_segments;
CREATE POLICY tenant_isolation ON sla.sla_segments AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS tenant_isolation ON sla.sla_pauses;
CREATE POLICY tenant_isolation ON sla.sla_pauses AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS tenant_isolation ON sla.escalations;
CREATE POLICY tenant_isolation ON sla.escalations AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
