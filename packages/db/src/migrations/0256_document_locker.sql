-- Document_Locker documents (requirements 12.2, 12.4, 12.8 to 12.10, 19.4). A document points at its file object
-- (quarantine pipeline, Tenant KMS key); soft delete hides it at once and sets purge_after to 30 days later.

CREATE SCHEMA IF NOT EXISTS docs;
GRANT USAGE ON SCHEMA docs TO cc_owner, cc_app, cc_reader, cc_definer;

CREATE TABLE IF NOT EXISTS docs.documents (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  file_id uuid NOT NULL,
  doc_type text NOT NULL CHECK (length(doc_type) BETWEEN 1 AND 200),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 255),
  deleted_at timestamptz,
  purge_after timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, file_id),
  FOREIGN KEY (tenant_id, file_id) REFERENCES core.file_objects (tenant_id, id),
  FOREIGN KEY (tenant_id, owner_id) REFERENCES core.users (tenant_id, id) ON DELETE CASCADE,
  CHECK ((deleted_at IS NULL) = (purge_after IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_documents_owner ON docs.documents (tenant_id, owner_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_purge ON docs.documents (tenant_id, purge_after) WHERE deleted_at IS NOT NULL;

ALTER TABLE docs.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE docs.documents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON docs.documents;
CREATE POLICY tenant_isolation ON docs.documents AS RESTRICTIVE FOR ALL TO cc_app
  USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS app_access ON docs.documents;
CREATE POLICY app_access ON docs.documents AS PERMISSIVE FOR ALL TO cc_app USING (true) WITH CHECK (true);
REVOKE ALL ON docs.documents FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON docs.documents TO cc_app;
GRANT SELECT ON docs.documents TO cc_reader;
-- Erasure and purge remove the file rows with the document.
GRANT DELETE ON core.file_objects TO cc_app;
