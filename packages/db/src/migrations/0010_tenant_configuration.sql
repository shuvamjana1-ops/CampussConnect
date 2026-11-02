-- Tenant configuration (requirements 1.5, 1.6, 2.7, 5.5, 18.1, 22.7). Every table carries tenant_id under row-level
-- security, so a configuration change can only affect the Tenant in context. Values are also bounded by CHECK
-- constraints that mirror the validation catalogue, as a second layer behind the API validation.
-- Working calendars are replaced, never deleted (G8): the application role has no DELETE grant on them.

CREATE TABLE IF NOT EXISTS core.tenant_config (
  tenant_id uuid PRIMARY KEY,
  time_zone text NOT NULL DEFAULT 'Asia/Kolkata' CHECK (length(time_zone) BETWEEN 1 AND 64),
  region text NOT NULL DEFAULT 'ap-south-1' CHECK (length(region) BETWEEN 1 AND 32),
  confidence_threshold numeric(3, 2) NOT NULL DEFAULT 0.70 CHECK (confidence_threshold BETWEEN 0 AND 1),
  duplicate_threshold numeric(3, 2) NOT NULL DEFAULT 0.60 CHECK (duplicate_threshold BETWEEN 0 AND 1),
  copilot_confidence_threshold numeric(3, 2) NOT NULL DEFAULT 0.70 CHECK (copilot_confidence_threshold BETWEEN 0 AND 1),
  k_anonymity integer NOT NULL DEFAULT 5 CHECK (k_anonymity BETWEEN 2 AND 1000),
  spike_cluster_k integer NOT NULL DEFAULT 5 CHECK (spike_cluster_k BETWEEN 3 AND 20),
  session_idle_minutes integer NOT NULL DEFAULT 30 CHECK (session_idle_minutes BETWEEN 5 AND 480),
  sms_enabled boolean NOT NULL DEFAULT false,
  broadcast_approval_required boolean NOT NULL DEFAULT true,
  broadcast_recipient_cap integer NOT NULL DEFAULT 50000 CHECK (broadcast_recipient_cap >= 1),
  executive_digest_weekday smallint NOT NULL DEFAULT 1 CHECK (executive_digest_weekday BETWEEN 1 AND 7),
  executive_digest_time text NOT NULL DEFAULT '08:00' CHECK (executive_digest_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  training_label_opt_in boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.departments (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_departments_name ON core.departments (tenant_id, lower(name));

CREATE TABLE IF NOT EXISTS core.department_duty (
  tenant_id uuid NOT NULL,
  department_id uuid NOT NULL,
  user_id uuid NOT NULL,
  on_duty boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, department_id, user_id),
  FOREIGN KEY (tenant_id, department_id) REFERENCES core.departments (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS core.categories (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  default_department_id uuid,
  default_band text NOT NULL DEFAULT 'P2' CHECK (default_band IN ('P0', 'P1', 'P2', 'P3')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, default_department_id) REFERENCES core.departments (tenant_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_name ON core.categories (tenant_id, lower(name));

CREATE TABLE IF NOT EXISTS core.routing_rules (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL,
  keywords text[] NOT NULL CHECK (cardinality(keywords) >= 1),
  department_id uuid NOT NULL,
  rank integer NOT NULL CHECK (rank >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, category_id) REFERENCES core.categories (tenant_id, id),
  FOREIGN KEY (tenant_id, department_id) REFERENCES core.departments (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_routing_rules_rank ON core.routing_rules (tenant_id, rank);

CREATE TABLE IF NOT EXISTS core.sla_policies (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  band text NOT NULL CHECK (band IN ('P0', 'P1', 'P2', 'P3')),
  category_id uuid,
  first_response_min integer NOT NULL CHECK (first_response_min >= 1),
  resolution_min integer NOT NULL CHECK (resolution_min >= 1),
  l1_min integer NOT NULL CHECK (l1_min >= 1),
  l2_min integer NOT NULL CHECK (l2_min >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, category_id) REFERENCES core.categories (tenant_id, id)
);

-- One band default per Tenant, and one override per band and category.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sla_policies_band_default
  ON core.sla_policies (tenant_id, band) WHERE category_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sla_policies_band_category
  ON core.sla_policies (tenant_id, band, category_id) WHERE category_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS core.working_calendars (
  tenant_id uuid PRIMARY KEY,
  time_zone text NOT NULL CHECK (length(time_zone) BETWEEN 1 AND 64),
  weekly jsonb NOT NULL,
  holidays date[] NOT NULL DEFAULT '{}',
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.rate_limit_config (
  tenant_id uuid NOT NULL,
  scope text NOT NULL CHECK (scope IN ('user', 'tenant')),
  request_limit integer NOT NULL CHECK (request_limit >= 1),
  window_sec integer NOT NULL CHECK (window_sec >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, scope)
);

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tenant_config', 'departments', 'department_duty', 'categories', 'routing_rules',
    'sla_policies', 'working_calendars', 'rate_limit_config'
  ] LOOP
    EXECUTE format('ALTER TABLE core.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON core.%I', t || '_tenant', t);
    EXECUTE format(
      'CREATE POLICY %I ON core.%I FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant())',
      t || '_tenant', t);
    EXECUTE format('REVOKE ALL ON core.%I FROM PUBLIC', t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE ON core.tenant_config, core.departments, core.categories, core.working_calendars,
  core.rate_limit_config TO cc_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON core.department_duty, core.routing_rules, core.sla_policies TO cc_app;

-- RLS lint: explicit statements for static analysis
ALTER TABLE core.tenant_config FORCE ROW LEVEL SECURITY;
ALTER TABLE core.departments FORCE ROW LEVEL SECURITY;
ALTER TABLE core.department_duty FORCE ROW LEVEL SECURITY;
ALTER TABLE core.categories FORCE ROW LEVEL SECURITY;
ALTER TABLE core.routing_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE core.sla_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE core.working_calendars FORCE ROW LEVEL SECURITY;
ALTER TABLE core.rate_limit_config FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_config_tenant ON core.tenant_config;
CREATE POLICY tenant_isolation ON core.tenant_config AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS departments_tenant ON core.departments;
CREATE POLICY tenant_isolation ON core.departments AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS department_duty_tenant ON core.department_duty;
CREATE POLICY tenant_isolation ON core.department_duty AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS categories_tenant ON core.categories;
CREATE POLICY tenant_isolation ON core.categories AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS routing_rules_tenant ON core.routing_rules;
CREATE POLICY tenant_isolation ON core.routing_rules AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS sla_policies_tenant ON core.sla_policies;
CREATE POLICY tenant_isolation ON core.sla_policies AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS working_calendars_tenant ON core.working_calendars;
CREATE POLICY tenant_isolation ON core.working_calendars AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS rate_limit_config_tenant ON core.rate_limit_config;
CREATE POLICY tenant_isolation ON core.rate_limit_config AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
