-- Identity_Service tables (requirements 2.1 to 2.3, 2.9, 17.3, 17.4): users, roles, department scope, grants,
-- Student records, authentication attempts (lockout input) and TOTP factors.
-- Every table carries tenant_id, leads its indexes with it and is protected by forced row-level security.

CREATE TABLE IF NOT EXISTS core.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  external_subject text NOT NULL CHECK (length(external_subject) BETWEEN 1 AND 256),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 200),
  email text NOT NULL CHECK (length(email) BETWEEN 3 AND 320),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, external_subject)
);

CREATE TABLE IF NOT EXISTS core.user_roles (
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL
    CHECK (role IN ('student', 'handler', 'dept_head', 'executive', 'ombudsperson', 'tenant_admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id, role),
  FOREIGN KEY (tenant_id, user_id) REFERENCES core.users (tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS core.user_departments (
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  department_id uuid NOT NULL,
  PRIMARY KEY (tenant_id, user_id, department_id),
  FOREIGN KEY (tenant_id, user_id) REFERENCES core.users (tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS core.user_grants (
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  grant_name text NOT NULL CHECK (grant_name IN ('opportunity.publish', 'broadcast.approve')),
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id, grant_name),
  FOREIGN KEY (tenant_id, user_id) REFERENCES core.users (tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS core.students (
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  erp_external_id text NOT NULL CHECK (length(erp_external_id) BETWEEN 1 AND 128),
  roll_number text NOT NULL,
  program text NOT NULL,
  year integer NOT NULL,
  department_id uuid,
  erp_department text NOT NULL,
  hostel text,
  gender text,
  social_category text,
  enrolment_status text NOT NULL CHECK (enrolment_status IN ('active', 'inactive')),
  erp_synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id),
  UNIQUE (tenant_id, erp_external_id),
  FOREIGN KEY (tenant_id, user_id) REFERENCES core.users (tenant_id, id) ON DELETE CASCADE
);

-- Lockout input (2.9). `account_key` is a lower-cased account name or user id. Kept 24 hours.
CREATE TABLE IF NOT EXISTS core.auth_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL,
  account_key text NOT NULL CHECK (length(account_key) BETWEEN 1 AND 256),
  at_ms bigint NOT NULL,
  success boolean NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_attempts_account
  ON core.auth_attempts (tenant_id, account_key, at_ms);

-- TOTP factors. The secret is stored only as ciphertext under the platform KMS key.
CREATE TABLE IF NOT EXISTS core.mfa_factors (
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  secret_ciphertext text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  last_used_step bigint,
  PRIMARY KEY (tenant_id, user_id),
  FOREIGN KEY (tenant_id, user_id) REFERENCES core.users (tenant_id, id) ON DELETE CASCADE
);

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users', 'user_roles', 'user_departments', 'user_grants', 'students', 'auth_attempts', 'mfa_factors']
  LOOP
    EXECUTE format('ALTER TABLE core.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE core.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON core.%I AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant())',
      t
    );
    EXECUTE format(
      'CREATE POLICY tenant_access ON core.%I AS PERMISSIVE FOR ALL TO cc_app USING (true) WITH CHECK (true)',
      t
    );
    EXECUTE format('REVOKE ALL ON core.%I FROM PUBLIC', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON core.%I TO cc_app', t);
  END LOOP;
END $$;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA core TO cc_app;

-- RLS lint: explicit statements for static analysis
ALTER TABLE core.users FORCE ROW LEVEL SECURITY;
ALTER TABLE core.user_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE core.user_departments FORCE ROW LEVEL SECURITY;
ALTER TABLE core.user_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE core.students FORCE ROW LEVEL SECURITY;
ALTER TABLE core.auth_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE core.mfa_factors FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON core.users;
CREATE POLICY tenant_isolation ON core.users AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS tenant_isolation ON core.user_roles;
CREATE POLICY tenant_isolation ON core.user_roles AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS tenant_isolation ON core.user_departments;
CREATE POLICY tenant_isolation ON core.user_departments AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS tenant_isolation ON core.user_grants;
CREATE POLICY tenant_isolation ON core.user_grants AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS tenant_isolation ON core.students;
CREATE POLICY tenant_isolation ON core.students AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS tenant_isolation ON core.auth_attempts;
CREATE POLICY tenant_isolation ON core.auth_attempts AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS tenant_isolation ON core.mfa_factors;
CREATE POLICY tenant_isolation ON core.mfa_factors AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
