-- Staff_Workbench tables (requirements 7.1, 7.3, 7.4, 7.5, 7.6, 7.12, 25.5, 25.6): training labels, per-Tenant
-- exclusion counts, canned replies and the AI summary cache. Every table carries tenant_id, leads its indexes with it
-- and is protected by forced row-level security with a restrictive tenant policy.

CREATE SCHEMA IF NOT EXISTS workbench;
GRANT USAGE ON SCHEMA workbench TO cc_owner, cc_app, cc_reader, cc_definer;

-- Queue index (7.1): first page of a Handler's open Tickets in queue order.
CREATE INDEX IF NOT EXISTS idx_tickets_queue
  ON tickets.tickets (tenant_id, assignee_id, is_open, band_rank, sort_due_at, created_at, id);
-- Needs_Verification_Lane (7.3, G15) and the override-rate window (7.5).
CREATE INDEX IF NOT EXISTS idx_tickets_needs_verification
  ON tickets.tickets (tenant_id, department_id, band_rank, created_at, id)
  WHERE is_open AND (flags ->> 'needsVerification' = 'true' OR flags ->> 'pendingManualTriage' = 'true');
CREATE INDEX IF NOT EXISTS idx_triage_results_window ON triage.triage_results (tenant_id, created_at, category_id);

-- One row per field confirmed or corrected by a Handler (7.4). Free text is stored only as redacted text, and only
-- when the Tenant opted in and redaction succeeded (25.5, 25.6); otherwise `eligible` is false and `redacted_text` null.
CREATE TABLE IF NOT EXISTS workbench.training_labels (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL,
  field text NOT NULL CHECK (field IN ('category', 'band', 'department')),
  kind text NOT NULL CHECK (kind IN ('confirm', 'correct')),
  original_value text NOT NULL CHECK (length(original_value) BETWEEN 1 AND 64),
  corrected_value text NOT NULL CHECK (length(corrected_value) BETWEEN 1 AND 64),
  original_confidence numeric(3, 2) CHECK (original_confidence BETWEEN 0 AND 1),
  handler_id uuid NOT NULL,
  redacted_text text CHECK (length(redacted_text) <= 25000),
  eligible boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CHECK (eligible = (redacted_text IS NOT NULL)),
  FOREIGN KEY (tenant_id, ticket_id) REFERENCES tickets.tickets (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_training_labels_ticket ON workbench.training_labels (tenant_id, ticket_id, created_at);
CREATE INDEX IF NOT EXISTS idx_training_labels_window ON workbench.training_labels (tenant_id, kind, created_at);

-- Corrections left out of the training set, counted per Tenant (25.5).
CREATE TABLE IF NOT EXISTS workbench.training_exclusions (
  tenant_id uuid NOT NULL PRIMARY KEY,
  excluded_count bigint NOT NULL DEFAULT 0 CHECK (excluded_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workbench.canned_replies (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  -- Null means the reply is available to every department in the Tenant.
  department_id uuid,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, department_id) REFERENCES core.departments (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_canned_replies_department ON workbench.canned_replies (tenant_id, department_id, title);

-- AI summary cache, one row per Ticket, valid for the Ticket version and message count it was built from (7.12).
CREATE TABLE IF NOT EXISTS workbench.ticket_summaries (
  tenant_id uuid NOT NULL,
  ticket_id uuid NOT NULL,
  ticket_version integer NOT NULL CHECK (ticket_version >= 1),
  message_count integer NOT NULL CHECK (message_count >= 0),
  summary text NOT NULL CHECK (length(summary) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, ticket_id),
  FOREIGN KEY (tenant_id, ticket_id) REFERENCES tickets.tickets (tenant_id, id) ON DELETE CASCADE
);

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['training_labels', 'training_exclusions', 'canned_replies', 'ticket_summaries']
  LOOP
    EXECUTE format('ALTER TABLE workbench.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE workbench.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON workbench.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON workbench.%I AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant())',
      t
    );
    EXECUTE format('REVOKE ALL ON workbench.%I FROM PUBLIC', t);
  END LOOP;
END $$;

-- Training labels: staff write them for Tickets they can see and read them back. No UPDATE or DELETE grant.
DROP POLICY IF EXISTS staff_labels_select ON workbench.training_labels;
CREATE POLICY staff_labels_select ON workbench.training_labels AS PERMISSIVE FOR SELECT TO cc_app
  USING (((SELECT app.has_role('handler')) OR (SELECT app.has_role('dept_head')))
         AND EXISTS (SELECT 1 FROM tickets.tickets t
                     WHERE t.tenant_id = training_labels.tenant_id AND t.id = training_labels.ticket_id));
DROP POLICY IF EXISTS staff_labels_insert ON workbench.training_labels;
CREATE POLICY staff_labels_insert ON workbench.training_labels AS PERMISSIVE FOR INSERT TO cc_app
  WITH CHECK (((SELECT app.has_role('handler')) OR (SELECT app.has_role('dept_head')))
              AND handler_id = (SELECT app.uid())
              AND EXISTS (SELECT 1 FROM tickets.tickets t
                          WHERE t.tenant_id = training_labels.tenant_id AND t.id = training_labels.ticket_id));

DROP POLICY IF EXISTS staff_exclusions ON workbench.training_exclusions;
CREATE POLICY staff_exclusions ON workbench.training_exclusions AS PERMISSIVE FOR ALL TO cc_app
  USING ((SELECT app.has_role('handler')) OR (SELECT app.has_role('dept_head')))
  WITH CHECK ((SELECT app.has_role('handler')) OR (SELECT app.has_role('dept_head')));

-- Canned replies: staff read tenant-wide replies and those of their departments; Handlers and Dept_Heads manage them.
DROP POLICY IF EXISTS staff_canned_select ON workbench.canned_replies;
CREATE POLICY staff_canned_select ON workbench.canned_replies AS PERMISSIVE FOR SELECT TO cc_app
  USING (((SELECT app.has_role('handler')) OR (SELECT app.has_role('dept_head')))
         AND (department_id IS NULL OR department_id = ANY((SELECT app.depts()))));
DROP POLICY IF EXISTS staff_canned_write ON workbench.canned_replies;
CREATE POLICY staff_canned_write ON workbench.canned_replies AS PERMISSIVE FOR ALL TO cc_app
  USING ((SELECT app.has_role('dept_head'))
         OR ((SELECT app.has_role('handler')) AND created_by = (SELECT app.uid())))
  WITH CHECK (((SELECT app.has_role('dept_head')) OR (SELECT app.has_role('handler')))
              AND (department_id IS NULL OR department_id = ANY((SELECT app.depts()))));

DROP POLICY IF EXISTS staff_summaries ON workbench.ticket_summaries;
CREATE POLICY staff_summaries ON workbench.ticket_summaries AS PERMISSIVE FOR ALL TO cc_app
  USING (((SELECT app.has_role('handler')) OR (SELECT app.has_role('dept_head')))
         AND EXISTS (SELECT 1 FROM tickets.tickets t
                     WHERE t.tenant_id = ticket_summaries.tenant_id AND t.id = ticket_summaries.ticket_id))
  WITH CHECK (((SELECT app.has_role('handler')) OR (SELECT app.has_role('dept_head')))
              AND EXISTS (SELECT 1 FROM tickets.tickets t
                          WHERE t.tenant_id = ticket_summaries.tenant_id AND t.id = ticket_summaries.ticket_id));

GRANT SELECT, INSERT ON workbench.training_labels TO cc_app;
GRANT SELECT, INSERT, UPDATE ON workbench.training_exclusions TO cc_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON workbench.canned_replies TO cc_app;
GRANT SELECT, INSERT, UPDATE ON workbench.ticket_summaries TO cc_app;
GRANT SELECT ON ALL TABLES IN SCHEMA workbench TO cc_reader;

-- RLS lint: explicit statements for static analysis
ALTER TABLE workbench.training_labels FORCE ROW LEVEL SECURITY;
ALTER TABLE workbench.training_exclusions FORCE ROW LEVEL SECURITY;
ALTER TABLE workbench.canned_replies FORCE ROW LEVEL SECURITY;
ALTER TABLE workbench.ticket_summaries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON workbench.training_labels;
CREATE POLICY tenant_isolation ON workbench.training_labels AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS tenant_isolation ON workbench.training_exclusions;
CREATE POLICY tenant_isolation ON workbench.training_exclusions AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS tenant_isolation ON workbench.canned_replies;
CREATE POLICY tenant_isolation ON workbench.canned_replies AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS tenant_isolation ON workbench.ticket_summaries;
CREATE POLICY tenant_isolation ON workbench.ticket_summaries AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
