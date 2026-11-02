-- SLA threshold and escalation handlers (requirements 6.3 to 6.7, 8.4). The timer consumers run without a user, so they
-- change the Ticket's flags and escalation level only through the SECURITY DEFINER functions below, which stay inside
-- the current Tenant. Reads of user roles reuse the definer grants from the triage migration.

GRANT USAGE ON SCHEMA tickets, core TO cc_definer;
GRANT SELECT ON core.user_roles, core.user_departments TO cc_definer;
GRANT SELECT ON tickets.ombudsperson_decisions TO cc_definer;
GRANT SELECT, UPDATE ON sla.escalations TO cc_definer;

DROP POLICY IF EXISTS sla_system ON tickets.ombudsperson_decisions;
CREATE POLICY sla_system ON tickets.ombudsperson_decisions AS PERMISSIVE FOR SELECT TO cc_definer
  USING (tenant_id = app.tenant());

DROP POLICY IF EXISTS sla_system ON sla.escalations;
CREATE POLICY sla_system ON sla.escalations AS PERMISSIVE FOR ALL TO cc_definer
  USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());

DROP POLICY IF EXISTS sla_system ON core.user_roles;
CREATE POLICY sla_system ON core.user_roles AS PERMISSIVE FOR SELECT TO cc_definer USING (tenant_id = app.tenant());
DROP POLICY IF EXISTS sla_system ON core.user_departments;
CREATE POLICY sla_system ON core.user_departments AS PERMISSIVE FOR SELECT TO cc_definer USING (tenant_id = app.tenant());

-- Sets a status flag (atRisk, breached, ombudspersonOverdue, escalationFailed). Returns true when the flag changed,
-- so a redelivered or re-armed timer does not notify twice. Closed Tickets are left alone.
CREATE OR REPLACE FUNCTION sla.set_ticket_flag(p_ticket_id uuid, p_flag text, p_value boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tickets, app
AS $$
DECLARE
  v_changed integer;
BEGIN
  IF p_flag NOT IN ('atRisk', 'breached', 'ombudspersonOverdue', 'escalationFailed') THEN
    RAISE EXCEPTION 'Unknown SLA flag %', p_flag;
  END IF;
  UPDATE tickets.tickets t
  SET flags = CASE WHEN p_value THEN t.flags || jsonb_build_object(p_flag, true) ELSE t.flags - p_flag END,
      updated_at = now()
  WHERE t.tenant_id = app.tenant() AND t.id = p_ticket_id AND t.is_open
    AND (COALESCE((t.flags ->> p_flag)::boolean, false) IS DISTINCT FROM p_value);
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  RETURN v_changed > 0;
END
$$;

-- Raises the Ticket to the given level when it is open and below it (the level never decreases, 6.3). Level 2 and
-- 3 move ownership to the Dept_Head. Returns the people the notifications need; `applied` is false for a no-op.
CREATE OR REPLACE FUNCTION sla.apply_escalation(p_ticket_id uuid, p_level smallint)
RETURNS TABLE (
  applied boolean,
  reporter_id uuid,
  confidential boolean,
  assignee_id uuid,
  department_id uuid,
  eta timestamptz,
  target_user_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tickets, core, app
AS $$
DECLARE
  t tickets.tickets%ROWTYPE;
  v_target uuid;
BEGIN
  SELECT * INTO t FROM tickets.tickets x WHERE x.tenant_id = app.tenant() AND x.id = p_ticket_id FOR UPDATE;
  IF NOT FOUND OR NOT t.is_open OR t.escalation_level >= p_level THEN
    RETURN QUERY SELECT false, NULL::uuid, false, NULL::uuid, NULL::uuid, NULL::timestamptz, NULL::uuid;
    RETURN;
  END IF;

  IF p_level = 1 THEN
    v_target := t.assignee_id;
  ELSIF p_level = 2 THEN
    SELECT ur.user_id INTO v_target
    FROM core.user_roles ur
    JOIN core.user_departments ud ON ud.tenant_id = ur.tenant_id AND ud.user_id = ur.user_id
    WHERE ur.tenant_id = t.tenant_id AND ur.role = 'dept_head' AND ud.department_id = t.department_id
    ORDER BY ur.user_id LIMIT 1;
  ELSE
    SELECT ur.user_id INTO v_target
    FROM core.user_roles ur
    WHERE ur.tenant_id = t.tenant_id AND ur.role = 'ombudsperson'
    ORDER BY ur.user_id LIMIT 1;
  END IF;

  UPDATE tickets.tickets x
  SET escalation_level = p_level,
      max_escalation_level = GREATEST(x.max_escalation_level, p_level),
      owner_level = CASE WHEN p_level >= 2 THEN 'dept_head' ELSE x.owner_level END,
      flags = CASE WHEN p_level = 1 THEN x.flags || '{"breached": true}'::jsonb ELSE x.flags END
              || CASE WHEN p_level > 1 AND v_target IS NULL THEN '{"escalationFailed": true}'::jsonb ELSE '{}'::jsonb END,
      updated_at = now()
  WHERE x.tenant_id = t.tenant_id AND x.id = t.id;

  RETURN QUERY SELECT true, t.reporter_id, t.confidential, t.assignee_id, t.department_id, t.eta, v_target;
END
$$;

-- Flags the L3 review as overdue (8.4) when the Ticket is still open at L3 with no decision recorded, and returns the
-- Dept_Head to notify. `applied` is false when the flag was already set or a decision exists.
CREATE OR REPLACE FUNCTION sla.mark_ombudsperson_overdue(p_ticket_id uuid)
RETURNS TABLE (applied boolean, department_id uuid, target_user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tickets, core, sla, app
AS $$
DECLARE
  t tickets.tickets%ROWTYPE;
  v_target uuid;
BEGIN
  SELECT * INTO t FROM tickets.tickets x WHERE x.tenant_id = app.tenant() AND x.id = p_ticket_id FOR UPDATE;
  IF NOT FOUND OR NOT t.is_open OR t.escalation_level < 3
     OR COALESCE((t.flags ->> 'ombudspersonOverdue')::boolean, false)
     OR EXISTS (SELECT 1 FROM tickets.ombudsperson_decisions d WHERE d.tenant_id = t.tenant_id AND d.ticket_id = t.id) THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  SELECT ur.user_id INTO v_target
  FROM core.user_roles ur
  JOIN core.user_departments ud ON ud.tenant_id = ur.tenant_id AND ud.user_id = ur.user_id
  WHERE ur.tenant_id = t.tenant_id AND ur.role = 'dept_head' AND ud.department_id = t.department_id
  ORDER BY ur.user_id LIMIT 1;

  UPDATE tickets.tickets x
  SET flags = x.flags || '{"ombudspersonOverdue": true}'::jsonb
              || CASE WHEN v_target IS NULL THEN '{"escalationFailed": true}'::jsonb ELSE '{}'::jsonb END,
      updated_at = now()
  WHERE x.tenant_id = t.tenant_id AND x.id = t.id;

  UPDATE sla.escalations e SET overdue = true
  WHERE e.tenant_id = t.tenant_id AND e.ticket_id = t.id AND e.level = 3;

  RETURN QUERY SELECT true, t.department_id, v_target;
END
$$;

-- A fresh clock after reopen starts again at L0; the previous maximum stays in `max_escalation_level` (6.3).
CREATE OR REPLACE FUNCTION sla.reset_escalation(p_ticket_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, tickets, app
AS $$
  UPDATE tickets.tickets t
  SET escalation_level = 0,
      flags = t.flags - 'atRisk' - 'breached' - 'ombudspersonOverdue',
      updated_at = now()
  WHERE t.tenant_id = app.tenant() AND t.id = p_ticket_id
$$;

ALTER FUNCTION sla.set_ticket_flag(uuid, text, boolean) OWNER TO cc_definer;
ALTER FUNCTION sla.apply_escalation(uuid, smallint) OWNER TO cc_definer;
ALTER FUNCTION sla.mark_ombudsperson_overdue(uuid) OWNER TO cc_definer;
ALTER FUNCTION sla.reset_escalation(uuid) OWNER TO cc_definer;
REVOKE ALL ON FUNCTION
  sla.set_ticket_flag(uuid, text, boolean), sla.apply_escalation(uuid, smallint),
  sla.mark_ombudsperson_overdue(uuid), sla.reset_escalation(uuid)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  sla.set_ticket_flag(uuid, text, boolean), sla.apply_escalation(uuid, smallint),
  sla.mark_ombudsperson_overdue(uuid), sla.reset_escalation(uuid)
TO cc_app;
