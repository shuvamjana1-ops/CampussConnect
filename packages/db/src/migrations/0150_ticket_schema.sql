-- Ticket_Service tables (requirements 3.8, 3.9, 3.13, 5.6, 8.1, 23.7): tickets, the confidential reporter link,
-- history, messages, attachments, links, confidential reveals and Ombudsperson decisions.
-- Every table carries tenant_id, leads its indexes with it and is protected by forced row-level security with a
-- restrictive tenant policy; role-specific access is granted by permissive policies (design, Row-level security).

CREATE SCHEMA IF NOT EXISTS tickets;
GRANT USAGE ON SCHEMA tickets TO cc_owner, cc_app, cc_reader, cc_definer;

-- Per-Tenant, per-year counter behind the human-readable reference (TKT-2026-000123).
CREATE TABLE IF NOT EXISTS tickets.ref_counters (
  tenant_id uuid NOT NULL,
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 9999),
  last_value integer NOT NULL DEFAULT 0 CHECK (last_value >= 0),
  PRIMARY KEY (tenant_id, year)
);

CREATE TABLE IF NOT EXISTS tickets.tickets (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ref text NOT NULL,
  type text NOT NULL CHECK (type IN ('request', 'complaint')),
  confidential boolean NOT NULL DEFAULT false,
  anon_ref text,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 128),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description text NOT NULL CHECK (length(description) BETWEEN 1 AND 20000),
  -- Produced by the PII_Redactor; null when redaction failed, in which case no AI call may use the text (5.3).
  description_redacted text,
  category_id uuid NOT NULL,
  department_id uuid,
  assignee_id uuid,
  owner_level text NOT NULL DEFAULT 'handler' CHECK (owner_level IN ('handler', 'dept_head')),
  band text NOT NULL CHECK (band IN ('P0', 'P1', 'P2', 'P3')),
  band_rank smallint GENERATED ALWAYS AS (
    CASE band WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END
  ) STORED,
  status text NOT NULL DEFAULT 'New' CHECK (status IN (
    'New', 'Assigned', 'In Progress', 'Awaiting Student', 'Resolved (Pending Confirmation)', 'Closed', 'Reopened'
  )),
  escalation_level smallint NOT NULL DEFAULT 0 CHECK (escalation_level BETWEEN 0 AND 3),
  max_escalation_level smallint NOT NULL DEFAULT 0 CHECK (max_escalation_level BETWEEN 0 AND 3),
  flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  eta timestamptz,
  sort_due_at timestamptz,
  closure_reason text CHECK (closure_reason IN ('Withdrawn', 'Confirmed', 'AutoConfirmed')),
  auto_confirmed boolean NOT NULL DEFAULT false,
  rating smallint CHECK (rating BETWEEN 1 AND 5),
  is_open boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  reporter_id uuid NOT NULL,
  -- Receipt commitments fixed at creation from the SLA policy, in minutes (3.13). Null when no policy exists.
  receipt_first_response_min integer CHECK (receipt_first_response_min >= 1),
  receipt_resolution_min integer CHECK (receipt_resolution_min >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, ref),
  UNIQUE (tenant_id, reporter_id, idempotency_key),
  UNIQUE (tenant_id, anon_ref),
  -- Only Grievances can be confidential, and a confidential Grievance always has an anonymous reference (3.8, 8.1).
  CHECK (NOT confidential OR (type = 'complaint' AND anon_ref IS NOT NULL)),
  CHECK (confidential OR anon_ref IS NULL),
  FOREIGN KEY (tenant_id, category_id) REFERENCES core.categories (tenant_id, id),
  FOREIGN KEY (tenant_id, department_id) REFERENCES core.departments (tenant_id, id),
  FOREIGN KEY (tenant_id, reporter_id) REFERENCES core.users (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_tickets_queue
  ON tickets.tickets (tenant_id, assignee_id, is_open, band_rank, sort_due_at, created_at, id);
CREATE INDEX IF NOT EXISTS idx_tickets_reporter
  ON tickets.tickets (tenant_id, reporter_id, is_open, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_department
  ON tickets.tickets (tenant_id, department_id, is_open, band_rank, created_at);

-- Reporter link with its own visibility policy (8.1).
CREATE TABLE IF NOT EXISTS tickets.ticket_reporters (
  tenant_id uuid NOT NULL,
  ticket_id uuid NOT NULL,
  user_id uuid NOT NULL,
  confidential boolean NOT NULL DEFAULT false,
  PRIMARY KEY (tenant_id, ticket_id),
  FOREIGN KEY (tenant_id, ticket_id) REFERENCES tickets.tickets (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, user_id) REFERENCES core.users (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_ticket_reporters_user ON tickets.ticket_reporters (tenant_id, user_id);

CREATE TABLE IF NOT EXISTS tickets.ticket_history (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL,
  actor_id uuid,
  at timestamptz NOT NULL DEFAULT now(),
  from_status text,
  to_status text NOT NULL,
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, ticket_id) REFERENCES tickets.tickets (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ticket_history_ticket ON tickets.ticket_history (tenant_id, ticket_id, at);

CREATE TABLE IF NOT EXISTS tickets.ticket_messages (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL,
  author_id uuid NOT NULL,
  visibility text NOT NULL CHECK (visibility IN ('public', 'internal')),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 20000),
  is_first_public_response boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, ticket_id) REFERENCES tickets.tickets (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON tickets.ticket_messages (tenant_id, ticket_id, created_at);

CREATE TABLE IF NOT EXISTS tickets.ticket_attachments (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL,
  object_key text NOT NULL,
  mime text NOT NULL CHECK (mime IN ('application/pdf', 'image/jpeg', 'image/png', 'video/mp4')),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  scan_status text NOT NULL DEFAULT 'pending' CHECK (scan_status IN ('pending', 'clean', 'rejected')),
  reject_reason text CHECK (reject_reason IN ('TOO_LARGE', 'TYPE_NOT_ALLOWED', 'LIMIT_REACHED', 'MALWARE_DETECTED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, ticket_id) REFERENCES tickets.tickets (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket ON tickets.ticket_attachments (tenant_id, ticket_id);

CREATE TABLE IF NOT EXISTS tickets.ticket_links (
  tenant_id uuid NOT NULL,
  ticket_id uuid NOT NULL,
  linked_ticket_id uuid NOT NULL,
  kind text NOT NULL CHECK (length(kind) BETWEEN 1 AND 32),
  PRIMARY KEY (tenant_id, ticket_id, linked_ticket_id, kind),
  CHECK (ticket_id <> linked_ticket_id),
  FOREIGN KEY (tenant_id, ticket_id) REFERENCES tickets.tickets (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, linked_ticket_id) REFERENCES tickets.tickets (tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tickets.confidential_reveals (
  tenant_id uuid NOT NULL,
  ticket_id uuid NOT NULL,
  handler_id uuid NOT NULL,
  ombudsperson_id uuid NOT NULL,
  reason_redacted text NOT NULL CHECK (length(reason_redacted) BETWEEN 10 AND 500),
  at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, ticket_id, handler_id),
  FOREIGN KEY (tenant_id, ticket_id) REFERENCES tickets.tickets (tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tickets.ombudsperson_decisions (
  tenant_id uuid NOT NULL,
  ticket_id uuid NOT NULL,
  decision text NOT NULL CHECK (length(decision) BETWEEN 1 AND 64),
  rationale text NOT NULL CHECK (length(rationale) BETWEEN 1 AND 2000),
  decided_by uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, ticket_id, at),
  FOREIGN KEY (tenant_id, ticket_id) REFERENCES tickets.tickets (tenant_id, id) ON DELETE CASCADE
);

-- Row-level security: forced, with a restrictive Tenant policy on every table.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ref_counters', 'tickets', 'ticket_reporters', 'ticket_history', 'ticket_messages',
    'ticket_attachments', 'ticket_links', 'confidential_reveals', 'ombudsperson_decisions'
  ]
  LOOP
    EXECUTE format('ALTER TABLE tickets.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE tickets.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON tickets.%I AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant())',
      t
    );
    EXECUTE format('REVOKE ALL ON tickets.%I FROM PUBLIC', t);
  END LOOP;
END $$;

-- ref_counters is touched only by the creation path, inside the Student's own transaction.
CREATE POLICY counter_access ON tickets.ref_counters AS PERMISSIVE FOR ALL TO cc_app USING (true) WITH CHECK (true);

-- tickets: Student sees own and may insert own; department staff and Ombudspersons per the design.
CREATE POLICY student_own ON tickets.tickets AS PERMISSIVE FOR SELECT TO cc_app
  USING ((SELECT app.has_role('student')) AND reporter_id = (SELECT app.uid()));
CREATE POLICY student_insert ON tickets.tickets AS PERMISSIVE FOR INSERT TO cc_app
  WITH CHECK ((SELECT app.has_role('student')) AND reporter_id = (SELECT app.uid()));
CREATE POLICY staff_department ON tickets.tickets AS PERMISSIVE FOR ALL TO cc_app
  USING (((SELECT app.has_role('handler')) OR (SELECT app.has_role('dept_head')))
         AND department_id = ANY((SELECT app.depts())))
  WITH CHECK (((SELECT app.has_role('handler')) OR (SELECT app.has_role('dept_head')))
              AND department_id = ANY((SELECT app.depts())));
CREATE POLICY ombudsperson_grievances ON tickets.tickets AS PERMISSIVE FOR ALL TO cc_app
  USING ((SELECT app.has_role('ombudsperson')) AND (type = 'complaint' OR escalation_level = 3))
  WITH CHECK ((SELECT app.has_role('ombudsperson')) AND (type = 'complaint' OR escalation_level = 3));

-- ticket_reporters: confidential identity is visible only to the reporter, Ombudspersons and revealed Handlers (8.1).
CREATE POLICY reporter_visibility ON tickets.ticket_reporters AS PERMISSIVE FOR SELECT TO cc_app
  USING (NOT confidential
         OR user_id = (SELECT app.uid())
         OR (SELECT app.has_role('ombudsperson'))
         OR EXISTS (SELECT 1 FROM tickets.confidential_reveals r
                    WHERE r.tenant_id = ticket_reporters.tenant_id
                      AND r.ticket_id = ticket_reporters.ticket_id
                      AND r.handler_id = (SELECT app.uid())));
CREATE POLICY reporter_insert ON tickets.ticket_reporters AS PERMISSIVE FOR INSERT TO cc_app
  WITH CHECK ((SELECT app.has_role('student')) AND user_id = (SELECT app.uid()));

-- History: readable wherever the Ticket is readable; Students and staff may append. No UPDATE or DELETE grant.
CREATE POLICY via_ticket_select ON tickets.ticket_history AS PERMISSIVE FOR SELECT TO cc_app
  USING (EXISTS (SELECT 1 FROM tickets.tickets t WHERE t.tenant_id = ticket_history.tenant_id AND t.id = ticket_history.ticket_id));
CREATE POLICY via_ticket_insert ON tickets.ticket_history AS PERMISSIVE FOR INSERT TO cc_app
  WITH CHECK (EXISTS (SELECT 1 FROM tickets.tickets t WHERE t.tenant_id = ticket_history.tenant_id AND t.id = ticket_history.ticket_id));

-- Messages: Students see public messages only; staff and Ombudspersons see internal notes of Tickets they can read.
CREATE POLICY student_public ON tickets.ticket_messages AS PERMISSIVE FOR SELECT TO cc_app
  USING (visibility = 'public' AND EXISTS (
    SELECT 1 FROM tickets.tickets t WHERE t.tenant_id = ticket_messages.tenant_id AND t.id = ticket_messages.ticket_id));
CREATE POLICY student_message_insert ON tickets.ticket_messages AS PERMISSIVE FOR INSERT TO cc_app
  WITH CHECK ((SELECT app.has_role('student')) AND visibility = 'public' AND author_id = (SELECT app.uid()) AND EXISTS (
    SELECT 1 FROM tickets.tickets t WHERE t.tenant_id = ticket_messages.tenant_id AND t.id = ticket_messages.ticket_id));
CREATE POLICY staff_messages ON tickets.ticket_messages AS PERMISSIVE FOR ALL TO cc_app
  USING (((SELECT app.has_role('handler')) OR (SELECT app.has_role('dept_head')) OR (SELECT app.has_role('ombudsperson')))
         AND EXISTS (SELECT 1 FROM tickets.tickets t WHERE t.tenant_id = ticket_messages.tenant_id AND t.id = ticket_messages.ticket_id))
  WITH CHECK (((SELECT app.has_role('handler')) OR (SELECT app.has_role('dept_head')) OR (SELECT app.has_role('ombudsperson')))
              AND EXISTS (SELECT 1 FROM tickets.tickets t WHERE t.tenant_id = ticket_messages.tenant_id AND t.id = ticket_messages.ticket_id));

-- Attachments and links: follow the Ticket's visibility.
CREATE POLICY via_ticket ON tickets.ticket_attachments AS PERMISSIVE FOR ALL TO cc_app
  USING (EXISTS (SELECT 1 FROM tickets.tickets t WHERE t.tenant_id = ticket_attachments.tenant_id AND t.id = ticket_attachments.ticket_id))
  WITH CHECK (EXISTS (SELECT 1 FROM tickets.tickets t WHERE t.tenant_id = ticket_attachments.tenant_id AND t.id = ticket_attachments.ticket_id));
CREATE POLICY via_ticket ON tickets.ticket_links AS PERMISSIVE FOR ALL TO cc_app
  USING (EXISTS (SELECT 1 FROM tickets.tickets t WHERE t.tenant_id = ticket_links.tenant_id AND t.id = ticket_links.ticket_id))
  WITH CHECK (EXISTS (SELECT 1 FROM tickets.tickets t WHERE t.tenant_id = ticket_links.tenant_id AND t.id = ticket_links.ticket_id));

-- Reveals: Ombudspersons record them; the revealed Handler can see their own.
CREATE POLICY ombudsperson_reveals ON tickets.confidential_reveals AS PERMISSIVE FOR ALL TO cc_app
  USING ((SELECT app.has_role('ombudsperson')))
  WITH CHECK ((SELECT app.has_role('ombudsperson')));
CREATE POLICY handler_own_reveal ON tickets.confidential_reveals AS PERMISSIVE FOR SELECT TO cc_app
  USING (handler_id = (SELECT app.uid()));

-- Decisions: Ombudspersons decide; the reporter and department staff read decisions on Tickets they can see.
CREATE POLICY ombudsperson_decisions_all ON tickets.ombudsperson_decisions AS PERMISSIVE FOR ALL TO cc_app
  USING ((SELECT app.has_role('ombudsperson')))
  WITH CHECK ((SELECT app.has_role('ombudsperson')));
CREATE POLICY decisions_via_ticket ON tickets.ombudsperson_decisions AS PERMISSIVE FOR SELECT TO cc_app
  USING (EXISTS (SELECT 1 FROM tickets.tickets t
                 WHERE t.tenant_id = ombudsperson_decisions.tenant_id AND t.id = ombudsperson_decisions.ticket_id));

GRANT SELECT, INSERT, UPDATE ON tickets.ref_counters TO cc_app;
GRANT SELECT, INSERT, UPDATE ON tickets.tickets TO cc_app;
GRANT SELECT, INSERT ON tickets.ticket_reporters TO cc_app;
GRANT SELECT, INSERT ON tickets.ticket_history TO cc_app;
GRANT SELECT, INSERT, UPDATE ON tickets.ticket_messages TO cc_app;
GRANT SELECT, INSERT, UPDATE ON tickets.ticket_attachments TO cc_app;
GRANT SELECT, INSERT, DELETE ON tickets.ticket_links TO cc_app;
GRANT SELECT, INSERT ON tickets.confidential_reveals TO cc_app;
GRANT SELECT, INSERT ON tickets.ombudsperson_decisions TO cc_app;
GRANT SELECT ON ALL TABLES IN SCHEMA tickets TO cc_reader;

-- RLS lint: explicit statements for static analysis
ALTER TABLE tickets.ref_counters FORCE ROW LEVEL SECURITY;
ALTER TABLE tickets.tickets FORCE ROW LEVEL SECURITY;
ALTER TABLE tickets.ticket_reporters FORCE ROW LEVEL SECURITY;
ALTER TABLE tickets.ticket_history FORCE ROW LEVEL SECURITY;
ALTER TABLE tickets.ticket_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE tickets.ticket_attachments FORCE ROW LEVEL SECURITY;
ALTER TABLE tickets.ticket_links FORCE ROW LEVEL SECURITY;
ALTER TABLE tickets.confidential_reveals FORCE ROW LEVEL SECURITY;
ALTER TABLE tickets.ombudsperson_decisions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tickets.ref_counters;
CREATE POLICY tenant_isolation ON tickets.ref_counters AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS tenant_isolation ON tickets.tickets;
CREATE POLICY tenant_isolation ON tickets.tickets AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS tenant_isolation ON tickets.ticket_reporters;
CREATE POLICY tenant_isolation ON tickets.ticket_reporters AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS tenant_isolation ON tickets.ticket_history;
CREATE POLICY tenant_isolation ON tickets.ticket_history AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS tenant_isolation ON tickets.ticket_messages;
CREATE POLICY tenant_isolation ON tickets.ticket_messages AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS tenant_isolation ON tickets.ticket_attachments;
CREATE POLICY tenant_isolation ON tickets.ticket_attachments AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS tenant_isolation ON tickets.ticket_links;
CREATE POLICY tenant_isolation ON tickets.ticket_links AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS tenant_isolation ON tickets.confidential_reveals;
CREATE POLICY tenant_isolation ON tickets.confidential_reveals AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS tenant_isolation ON tickets.ombudsperson_decisions;
CREATE POLICY tenant_isolation ON tickets.ombudsperson_decisions AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
