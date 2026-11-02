-- Triage_Service tables (requirements 3.5, 5.4, 5.5, 5.6, 5.10, 23.4, 23.7): triage results and the AI call log.
-- Every table carries tenant_id, leads its indexes with it and is protected by forced row-level security with a
-- restrictive tenant policy. The triage consumer runs without a user, so it reads and changes Tickets only through
-- the SECURITY DEFINER functions below, which stay inside the current Tenant and only act on a Ticket in 'New'.

CREATE SCHEMA IF NOT EXISTS triage;
GRANT USAGE ON SCHEMA triage TO cc_owner, cc_app, cc_reader, cc_definer;

-- Fallback department when neither the Category nor the routing rules name one (5.10).
ALTER TABLE core.tenant_config ADD COLUMN IF NOT EXISTS default_department_id uuid;

CREATE TABLE IF NOT EXISTS triage.triage_results (
  tenant_id uuid NOT NULL,
  ticket_id uuid NOT NULL,
  category_id uuid NOT NULL,
  category_confidence numeric(3, 2) NOT NULL CHECK (category_confidence BETWEEN 0 AND 1),
  department_id uuid NOT NULL,
  department_confidence numeric(3, 2) NOT NULL CHECK (department_confidence BETWEEN 0 AND 1),
  band text NOT NULL CHECK (band IN ('P0', 'P1', 'P2', 'P3')),
  safety_forced_p0 boolean NOT NULL DEFAULT false,
  needs_verification boolean NOT NULL DEFAULT false,
  -- 'ai' for model output, 'rules' for keyword fallback, 'default' when redaction failed and no AI call was made.
  source text NOT NULL CHECK (source IN ('ai', 'rules', 'default')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, ticket_id),
  FOREIGN KEY (tenant_id, ticket_id) REFERENCES tickets.tickets (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, category_id) REFERENCES core.categories (tenant_id, id),
  FOREIGN KEY (tenant_id, department_id) REFERENCES core.departments (tenant_id, id)
);

-- One row per AI provider call. Only the SHA-256 of the redacted input is kept, never the text (5.1, 23.4).
CREATE TABLE IF NOT EXISTS triage.ai_calls (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  purpose text NOT NULL CHECK (purpose IN ('triage', 'suggest', 'summary', 'embed', 'copilot')),
  provider text NOT NULL CHECK (length(provider) BETWEEN 1 AND 64),
  model_id text NOT NULL CHECK (length(model_id) BETWEEN 1 AND 200),
  model_version text CHECK (length(model_version) <= 64),
  input_hash text NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  output jsonb,
  confidences numeric[] NOT NULL DEFAULT '{}',
  latency_ms integer NOT NULL CHECK (latency_ms >= 0),
  status text NOT NULL CHECK (length(status) BETWEEN 1 AND 32),
  error_message text CHECK (length(error_message) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_ai_calls_purpose ON triage.ai_calls (tenant_id, purpose, created_at DESC);

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['triage_results', 'ai_calls']
  LOOP
    EXECUTE format('ALTER TABLE triage.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE triage.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON triage.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON triage.%I AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant())',
      t
    );
    EXECUTE format('REVOKE ALL ON triage.%I FROM PUBLIC', t);
  END LOOP;
END $$;

-- The call log is written by the AI adapter sink in the current Tenant context.
DROP POLICY IF EXISTS ai_calls_insert ON triage.ai_calls;
CREATE POLICY ai_calls_insert ON triage.ai_calls AS PERMISSIVE FOR INSERT TO cc_app
  WITH CHECK (tenant_id = app.tenant());

-- Results are readable wherever the Ticket is readable. They are written only by triage.apply_result (definer).
DROP POLICY IF EXISTS results_via_ticket ON triage.triage_results;
CREATE POLICY results_via_ticket ON triage.triage_results AS PERMISSIVE FOR SELECT TO cc_app
  USING (EXISTS (SELECT 1 FROM tickets.tickets t
                 WHERE t.tenant_id = triage_results.tenant_id AND t.id = triage_results.ticket_id));

GRANT INSERT ON triage.ai_calls TO cc_app;
GRANT SELECT ON triage.triage_results TO cc_app;
GRANT SELECT ON ALL TABLES IN SCHEMA triage TO cc_reader;

-- System access for the definer role, bounded to the current Tenant.
GRANT USAGE ON SCHEMA triage, tickets, core TO cc_definer;
GRANT SELECT, INSERT, UPDATE ON triage.triage_results TO cc_definer;
DROP POLICY IF EXISTS triage_system ON triage.triage_results;
CREATE POLICY triage_system ON triage.triage_results AS PERMISSIVE FOR ALL TO cc_definer
  USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());

GRANT SELECT, UPDATE ON tickets.tickets TO cc_definer;
DROP POLICY IF EXISTS triage_system ON tickets.tickets;
CREATE POLICY triage_system ON tickets.tickets AS PERMISSIVE FOR ALL TO cc_definer
  USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());

GRANT SELECT, INSERT ON tickets.ticket_history TO cc_definer;
DROP POLICY IF EXISTS triage_system ON tickets.ticket_history;
CREATE POLICY triage_system ON tickets.ticket_history AS PERMISSIVE FOR ALL TO cc_definer
  USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());

GRANT SELECT ON core.user_roles, core.user_departments, core.department_duty TO cc_definer;
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['user_roles', 'user_departments', 'department_duty']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS triage_system ON core.%I', t);
    EXECUTE format(
      'CREATE POLICY triage_system ON core.%I AS PERMISSIVE FOR SELECT TO cc_definer USING (tenant_id = app.tenant())',
      t
    );
  END LOOP;
END $$;

-- What triage needs to know about a Ticket. Empty when the Ticket is not in the current Tenant.
CREATE OR REPLACE FUNCTION triage.ticket_for_triage(p_ticket_id uuid)
RETURNS TABLE (
  title text,
  description_redacted text,
  status text,
  band text,
  category_id uuid,
  flags jsonb,
  has_result boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, tickets, triage, app
AS $$
  SELECT t.title, t.description_redacted, t.status, t.band, t.category_id, t.flags,
         EXISTS (SELECT 1 FROM triage.triage_results r WHERE r.tenant_id = t.tenant_id AND r.ticket_id = t.id)
  FROM tickets.tickets t
  WHERE t.tenant_id = app.tenant() AND t.id = p_ticket_id
$$;

-- The raw text is needed only for the local keyword and safety-lexicon checks, which never leave the platform.
CREATE OR REPLACE FUNCTION triage.ticket_local_text(p_ticket_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, tickets, app
AS $$
  SELECT t.title || E'\n' || t.description FROM tickets.tickets t
  WHERE t.tenant_id = app.tenant() AND t.id = p_ticket_id
$$;

-- Stores the result and applies the New -> Assigned routing command (5.9). It changes nothing unless the Ticket is
-- still 'New'. The Handler is the least-loaded on-duty Handler of the department; with none, the Ticket stays 'New'
-- with the department set and the `unassigned` flag. Returns the assignee (null when none) and whether it applied.
CREATE OR REPLACE FUNCTION triage.apply_result(
  p_ticket_id uuid,
  p_category_id uuid,
  p_category_confidence numeric,
  p_department_id uuid,
  p_department_confidence numeric,
  p_band text,
  p_safety_forced_p0 boolean,
  p_needs_verification boolean,
  p_source text
)
RETURNS TABLE (applied boolean, assignee_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tickets, triage, core, app
AS $$
DECLARE
  v_tenant uuid := app.tenant();
  v_old_band text;
  v_handler uuid;
BEGIN
  SELECT t.band INTO v_old_band FROM tickets.tickets t
  WHERE t.tenant_id = v_tenant AND t.id = p_ticket_id AND t.status = 'New' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid;
    RETURN;
  END IF;

  INSERT INTO triage.triage_results
    (tenant_id, ticket_id, category_id, category_confidence, department_id, department_confidence, band,
     safety_forced_p0, needs_verification, source)
  VALUES (v_tenant, p_ticket_id, p_category_id, p_category_confidence, p_department_id, p_department_confidence,
          p_band, p_safety_forced_p0, p_needs_verification, p_source)
  ON CONFLICT (tenant_id, ticket_id) DO NOTHING;

  SELECT ur.user_id INTO v_handler
  FROM core.user_roles ur
  JOIN core.user_departments ud ON ud.tenant_id = ur.tenant_id AND ud.user_id = ur.user_id
  WHERE ur.tenant_id = v_tenant AND ur.role = 'handler' AND ud.department_id = p_department_id
    AND NOT EXISTS (SELECT 1 FROM core.department_duty d
                    WHERE d.tenant_id = ur.tenant_id AND d.department_id = p_department_id
                      AND d.user_id = ur.user_id AND NOT d.on_duty)
  ORDER BY (SELECT count(*) FROM tickets.tickets o
            WHERE o.tenant_id = v_tenant AND o.assignee_id = ur.user_id AND o.is_open), ur.user_id
  LIMIT 1;

  UPDATE tickets.tickets t SET
    category_id = p_category_id,
    department_id = p_department_id,
    band = p_band,
    assignee_id = v_handler,
    status = CASE WHEN v_handler IS NULL THEN 'New' ELSE 'Assigned' END,
    flags = (t.flags - 'pendingManualTriage')
            || jsonb_build_object('needsVerification', p_needs_verification)
            || CASE WHEN v_handler IS NULL THEN '{"unassigned": true}'::jsonb ELSE '{}'::jsonb END,
    version = t.version + 1,
    updated_at = now()
  WHERE t.tenant_id = v_tenant AND t.id = p_ticket_id;

  IF v_old_band IS DISTINCT FROM p_band THEN
    INSERT INTO tickets.ticket_history (tenant_id, ticket_id, actor_id, from_status, to_status, reason, kind)
    VALUES (v_tenant, p_ticket_id, NULL, 'New', 'New', 'Triage band ' || v_old_band || ' to ' || p_band, 'band');
  END IF;
  IF v_handler IS NOT NULL THEN
    INSERT INTO tickets.ticket_history (tenant_id, ticket_id, actor_id, from_status, to_status, reason, kind)
    VALUES (v_tenant, p_ticket_id, NULL, 'New', 'Assigned', 'Routed by triage', 'status');
  END IF;

  RETURN QUERY SELECT true, v_handler;
END
$$;

-- Watchdog (G6): keeps the Ticket 'New' and marks it for manual triage. Returns false when it is no longer 'New'.
CREATE OR REPLACE FUNCTION triage.mark_pending_manual(p_ticket_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tickets, app
AS $$
BEGIN
  UPDATE tickets.tickets t SET flags = t.flags || '{"pendingManualTriage": true}'::jsonb, updated_at = now()
  WHERE t.tenant_id = app.tenant() AND t.id = p_ticket_id AND t.status = 'New';
  RETURN FOUND;
END
$$;

-- Sets one boolean flag, e.g. `escalationFailed` (5.7).
CREATE OR REPLACE FUNCTION triage.set_flag(p_ticket_id uuid, p_flag text, p_value boolean)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, tickets, app
AS $$
  UPDATE tickets.tickets t SET flags = t.flags || jsonb_build_object(p_flag, p_value), updated_at = now()
  WHERE t.tenant_id = app.tenant() AND t.id = p_ticket_id AND p_flag IN ('escalationFailed', 'pendingManualTriage')
$$;

-- On-duty Dept_Heads of the department and every Ombudsperson in the Tenant, for P0 notification (5.7).
CREATE OR REPLACE FUNCTION triage.p0_recipients(p_department_id uuid)
RETURNS TABLE (user_id uuid, role text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, core, app
AS $$
  SELECT ur.user_id, ur.role
  FROM core.user_roles ur
  WHERE ur.tenant_id = app.tenant()
    AND (
      ur.role = 'ombudsperson'
      OR (ur.role = 'dept_head'
          AND p_department_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM core.user_departments ud
                      WHERE ud.tenant_id = ur.tenant_id AND ud.user_id = ur.user_id AND ud.department_id = p_department_id)
          AND NOT EXISTS (SELECT 1 FROM core.department_duty d
                          WHERE d.tenant_id = ur.tenant_id AND d.department_id = p_department_id
                            AND d.user_id = ur.user_id AND NOT d.on_duty))
    )
$$;

ALTER FUNCTION triage.ticket_for_triage(uuid) OWNER TO cc_definer;
ALTER FUNCTION triage.ticket_local_text(uuid) OWNER TO cc_definer;
ALTER FUNCTION triage.apply_result(uuid, uuid, numeric, uuid, numeric, text, boolean, boolean, text) OWNER TO cc_definer;
ALTER FUNCTION triage.mark_pending_manual(uuid) OWNER TO cc_definer;
ALTER FUNCTION triage.set_flag(uuid, text, boolean) OWNER TO cc_definer;
ALTER FUNCTION triage.p0_recipients(uuid) OWNER TO cc_definer;

REVOKE ALL ON FUNCTION
  triage.ticket_for_triage(uuid),
  triage.ticket_local_text(uuid),
  triage.apply_result(uuid, uuid, numeric, uuid, numeric, text, boolean, boolean, text),
  triage.mark_pending_manual(uuid),
  triage.set_flag(uuid, text, boolean),
  triage.p0_recipients(uuid)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  triage.ticket_for_triage(uuid),
  triage.ticket_local_text(uuid),
  triage.apply_result(uuid, uuid, numeric, uuid, numeric, text, boolean, boolean, text),
  triage.mark_pending_manual(uuid),
  triage.set_flag(uuid, text, boolean),
  triage.p0_recipients(uuid)
TO cc_app;

-- RLS lint: explicit statements for static analysis
ALTER TABLE triage.triage_results FORCE ROW LEVEL SECURITY;
ALTER TABLE triage.ai_calls FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON triage.triage_results;
CREATE POLICY tenant_isolation ON triage.triage_results AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS tenant_isolation ON triage.ai_calls;
CREATE POLICY tenant_isolation ON triage.ai_calls AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
