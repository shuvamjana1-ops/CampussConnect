-- Links between Locker documents and applications (requirements 12.2, 12.3). A link references the document; the
-- file is never copied. At most 50 links per document, enforced by the service under a row lock on the document.

CREATE TABLE IF NOT EXISTS docs.document_links (
  tenant_id uuid NOT NULL,
  application_id uuid NOT NULL,
  document_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, application_id, document_id),
  FOREIGN KEY (tenant_id, document_id) REFERENCES docs.documents (tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_document_links_document ON docs.document_links (tenant_id, document_id);

ALTER TABLE docs.document_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE docs.document_links FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON docs.document_links;
CREATE POLICY tenant_isolation ON docs.document_links AS RESTRICTIVE FOR ALL TO cc_app
  USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS app_access ON docs.document_links;
CREATE POLICY app_access ON docs.document_links AS PERMISSIVE FOR ALL TO cc_app USING (true) WITH CHECK (true);
REVOKE ALL ON docs.document_links FROM PUBLIC;

GRANT SELECT, INSERT, DELETE ON docs.document_links TO cc_app;
GRANT SELECT ON docs.document_links TO cc_reader;
