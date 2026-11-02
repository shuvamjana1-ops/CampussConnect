-- Ticket commands, messages and Student views (task 15.7; requirements 3.14, 3.15, 4.x, 6.4, 12.9, 12.10).
-- Adds the state the state machine and SLA views need, and lets a Student update their own Ticket (withdraw,
-- respond, confirm, dispute) while the application enforces the transition rules.

ALTER TABLE tickets.tickets
  ADD COLUMN IF NOT EXISTS resolver_id uuid,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_budget_factor numeric(3, 2) NOT NULL DEFAULT 1 CHECK (sla_budget_factor IN (0.5, 1)),
  ADD COLUMN IF NOT EXISTS first_response_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolution_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS eta_set_by uuid;

-- Band changes are recorded in history with an unchanged status; keep the reason column usable for them.
ALTER TABLE tickets.ticket_history
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'status' CHECK (kind IN ('status', 'band', 'eta'));

ALTER TABLE tickets.ticket_messages
  ADD CONSTRAINT ticket_messages_internal_length
  CHECK (visibility = 'public' OR length(body) BETWEEN 1 AND 5000) NOT VALID;

DROP POLICY IF EXISTS student_own_update ON tickets.tickets;
CREATE POLICY student_own_update ON tickets.tickets AS PERMISSIVE FOR UPDATE TO cc_app
  USING ((SELECT app.has_role('student')) AND reporter_id = (SELECT app.uid()))
  WITH CHECK ((SELECT app.has_role('student')) AND reporter_id = (SELECT app.uid()));
