-- Applications and deadline reminders (requirements 12.1, 12.5, 12.6, 12.7).

CREATE TABLE IF NOT EXISTS opps.applications (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  opportunity_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'Saved' CHECK (state IN ('Saved', 'Preparing', 'Submitted', 'Outcome')),
  outcome text CHECK (outcome IN ('Selected', 'Not Selected', 'Withdrawn')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, student_id, opportunity_id),
  FOREIGN KEY (tenant_id, opportunity_id) REFERENCES opps.opportunities (tenant_id, id),
  CHECK ((state = 'Outcome') = (outcome IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_applications_student ON opps.applications (tenant_id, student_id);
CREATE INDEX IF NOT EXISTS idx_applications_open
  ON opps.applications (tenant_id, opportunity_id) WHERE state IN ('Saved', 'Preparing');

CREATE TABLE IF NOT EXISTS opps.reminders_sent (
  tenant_id uuid NOT NULL,
  application_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('d7', 'd3')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, application_id, kind),
  FOREIGN KEY (tenant_id, application_id) REFERENCES opps.applications (tenant_id, id) ON DELETE CASCADE
);

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['applications', 'reminders_sent']
  LOOP
    EXECUTE format('ALTER TABLE opps.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE opps.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON opps.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON opps.%I AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant())',
      t
    );
    EXECUTE format('DROP POLICY IF EXISTS app_access ON opps.%I', t);
    EXECUTE format('CREATE POLICY app_access ON opps.%I AS PERMISSIVE FOR ALL TO cc_app USING (true) WITH CHECK (true)', t);
    EXECUTE format('REVOKE ALL ON opps.%I FROM PUBLIC', t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON opps.applications TO cc_app;
GRANT SELECT, INSERT ON opps.reminders_sent TO cc_app;
GRANT SELECT ON opps.applications, opps.reminders_sent TO cc_reader;

-- RLS lint: explicit statements for static analysis
ALTER TABLE opps.applications FORCE ROW LEVEL SECURITY;
ALTER TABLE opps.reminders_sent FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON opps.applications;
CREATE POLICY tenant_isolation ON opps.applications AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS tenant_isolation ON opps.reminders_sent;
CREATE POLICY tenant_isolation ON opps.reminders_sent AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
