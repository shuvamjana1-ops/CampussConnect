-- Tenant provisioning (requirements 1.7, 1.8, 1.9, 22.3): the tenant row, the roles provisioned for it, and a
-- compensation function that removes everything a provisioning run created.

CREATE TABLE IF NOT EXISTS core.tenants (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  region text NOT NULL CHECK (length(region) BETWEEN 1 AND 32),
  time_zone text NOT NULL CHECK (length(time_zone) BETWEEN 1 AND 64),
  data_key_id text NOT NULL,
  signing_key_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.tenant_roles (
  tenant_id uuid NOT NULL,
  role text NOT NULL
    CHECK (role IN ('student', 'handler', 'dept_head', 'executive', 'ombudsperson', 'tenant_admin')),
  PRIMARY KEY (tenant_id, role),
  FOREIGN KEY (tenant_id) REFERENCES core.tenants (id) ON DELETE CASCADE
);

DO $$
DECLARE
  t text;
  col text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tenants', 'tenant_roles'] LOOP
    col := CASE WHEN t = 'tenants' THEN 'id' ELSE 'tenant_id' END;
    EXECUTE format('ALTER TABLE core.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON core.%I', t || '_tenant', t);
    EXECUTE format(
      'CREATE POLICY %I ON core.%I FOR ALL TO cc_app USING (%I = app.tenant()) WITH CHECK (%I = app.tenant())',
      t || '_tenant', t, col, col);
    EXECUTE format('REVOKE ALL ON core.%I FROM PUBLIC', t);
  END LOOP;
END $$;

GRANT SELECT, INSERT ON core.tenants, core.tenant_roles TO cc_app;

-- Compensation for provisioning step 3 (design: "undone by deleting the tenant (cascade)"). The application role
-- has no DELETE grant on working calendars and configuration (G8), so the removal runs as the function owner and
-- is limited to the Tenant in the current transaction context.
CREATE OR REPLACE FUNCTION app.deprovision_tenant(p_tenant uuid) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core
AS $$
BEGIN
  IF p_tenant IS DISTINCT FROM app.tenant() THEN
    RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE = '42501';
  END IF;
  DELETE FROM core.sla_policies WHERE tenant_id = p_tenant;
  DELETE FROM core.routing_rules WHERE tenant_id = p_tenant;
  DELETE FROM core.categories WHERE tenant_id = p_tenant;
  DELETE FROM core.department_duty WHERE tenant_id = p_tenant;
  DELETE FROM core.departments WHERE tenant_id = p_tenant;
  DELETE FROM core.rate_limit_config WHERE tenant_id = p_tenant;
  DELETE FROM core.working_calendars WHERE tenant_id = p_tenant;
  DELETE FROM core.tenant_config WHERE tenant_id = p_tenant;
  DELETE FROM core.tenant_roles WHERE tenant_id = p_tenant;
  DELETE FROM core.tenants WHERE id = p_tenant;
END;
$$;

REVOKE ALL ON FUNCTION app.deprovision_tenant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.deprovision_tenant(uuid) TO cc_app;

-- RLS lint: explicit statements for static analysis
ALTER TABLE core.tenant_roles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_roles_tenant ON core.tenant_roles;
CREATE POLICY tenant_isolation ON core.tenant_roles AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
