-- CampusConnect database initialization
-- Creates roles, extensions, and foundation schema skeletons

-- Create database roles with appropriate permissions
CREATE ROLE cc_owner LOGIN PASSWORD 'cc_owner_password' VALID UNTIL 'infinity';
COMMENT ON ROLE cc_owner IS 'Owner role for schema management, migrations, and setup tasks.';

CREATE ROLE cc_app NOLOGIN;
COMMENT ON ROLE cc_app IS 'Application role that all connections assume after initial auth. Can read/write app tables under RLS constraints.';

CREATE ROLE cc_reader NOLOGIN;
COMMENT ON ROLE cc_reader IS 'Read-only role for analytics and reporting connections.';

CREATE ROLE cc_definer NOLOGIN;
COMMENT ON ROLE cc_definer IS 'Role for SECURITY DEFINER functions that need elevated permissions.';

-- Grant basic permissions
GRANT cc_app, cc_reader, cc_definer TO cc_owner;

-- Create extensions
CREATE EXTENSION IF NOT EXISTS pgvector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create app schema for helper functions
CREATE SCHEMA IF NOT EXISTS app;
GRANT USAGE ON SCHEMA app TO cc_owner, cc_app, cc_reader, cc_definer;

-- Helper functions that will be called by the application
CREATE OR REPLACE FUNCTION app.tenant() RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT current_setting('app.tenant_id')::uuid
$$;
COMMENT ON FUNCTION app.tenant() IS 'Return the current tenant ID from transaction-local settings.';

CREATE OR REPLACE FUNCTION app.uid() RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT current_setting('app.user_id')::uuid
$$;
COMMENT ON FUNCTION app.uid() IS 'Return the current user ID from transaction-local settings.';

CREATE OR REPLACE FUNCTION app.has_role(role_name text) RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT role_name = ANY(current_setting('app.roles')::text[])
$$;
COMMENT ON FUNCTION app.has_role(text) IS 'Check if current user has a specific role.';

CREATE OR REPLACE FUNCTION app.depts() RETURNS uuid[]
LANGUAGE sql
STABLE
AS $$
  SELECT current_setting('app.dept_ids')::uuid[]
$$;
COMMENT ON FUNCTION app.depts() IS 'Return the current user''s department IDs from transaction-local settings.';

-- Create platform schema for infrastructure tables
CREATE SCHEMA IF NOT EXISTS platform;
GRANT USAGE ON SCHEMA platform TO cc_owner, cc_app, cc_reader, cc_definer;

-- Create core schema for tenant data
CREATE SCHEMA IF NOT EXISTS core;
GRANT USAGE ON SCHEMA core TO cc_owner, cc_app, cc_reader, cc_definer;

-- Create audit schema for audit logs (separate from app data)
CREATE SCHEMA IF NOT EXISTS audit;
GRANT USAGE ON SCHEMA audit TO cc_owner, cc_app, cc_reader, cc_definer;

-- Create analytics schema for fact tables and views
CREATE SCHEMA IF NOT EXISTS analytics;
GRANT USAGE ON SCHEMA analytics TO cc_owner, cc_app, cc_reader, cc_definer;

-- Helper function to find the tenant that owns a resource
-- Used for cross-tenant access prevention
CREATE OR REPLACE FUNCTION app.owner_tenant_of(resource_type text, resource_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = core, app, public
AS $$
DECLARE
  tenant_id_result uuid;
BEGIN
  -- This is a placeholder implementation.
  -- Actual implementations will be added in subsequent migrations as tables are created.
  RETURN NULL;
END;
$$;
COMMENT ON FUNCTION app.owner_tenant_of(text, uuid) IS 
'SECURITY DEFINER function to find the tenant that owns a resource.
Used to prevent cross-tenant access without revealing resource existence.';

-- Grant default privileges so new objects in schemas have correct permissions
ALTER DEFAULT PRIVILEGES FOR ROLE cc_owner IN SCHEMA core GRANT SELECT, INSERT, UPDATE ON TABLES TO cc_app;
ALTER DEFAULT PRIVILEGES FOR ROLE cc_owner IN SCHEMA core GRANT SELECT ON TABLES TO cc_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE cc_owner IN SCHEMA platform GRANT SELECT, INSERT, UPDATE ON TABLES TO cc_app;
ALTER DEFAULT PRIVILEGES FOR ROLE cc_owner IN SCHEMA platform GRANT SELECT ON TABLES TO cc_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE cc_owner IN SCHEMA audit GRANT SELECT, INSERT ON TABLES TO cc_app;
ALTER DEFAULT PRIVILEGES FOR ROLE cc_owner IN SCHEMA audit GRANT SELECT ON TABLES TO cc_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE cc_owner IN SCHEMA analytics GRANT SELECT ON TABLES TO cc_reader;

