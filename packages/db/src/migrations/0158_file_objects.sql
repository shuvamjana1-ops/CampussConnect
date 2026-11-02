-- File objects for Ticket attachments and Document_Locker uploads (requirements 3.14-3.16, 12.9, 12.10, 22.3).
-- A row is created when an upload URL is issued (status 'pending'), then resolved by the `files` consumer from the
-- malware scan result: 'clean' once promoted to the clean store, or 'rejected' with a reason.

CREATE TABLE IF NOT EXISTS core.file_objects (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  target text NOT NULL CHECK (target IN ('ticket', 'document_locker')),
  -- The Ticket id for ticket attachments; the owning Student's user id for Document_Locker uploads.
  owner_id uuid NOT NULL,
  student_id uuid NOT NULL,
  declared_type text NOT NULL CHECK (declared_type IN ('application/pdf', 'image/jpeg', 'image/png', 'video/mp4')),
  declared_size integer NOT NULL CHECK (declared_size BETWEEN 1 AND 10485760),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'clean', 'rejected')),
  rejection_reason text CHECK (rejection_reason IN ('TOO_LARGE', 'TYPE_NOT_ALLOWED', 'LIMIT_REACHED', 'MALWARE_DETECTED')),
  quarantine_key text NOT NULL,
  clean_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  PRIMARY KEY (tenant_id, id),
  CHECK ((status = 'rejected') = (rejection_reason IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_file_objects_quarantine_key ON core.file_objects (quarantine_key);
CREATE INDEX IF NOT EXISTS idx_file_objects_owner ON core.file_objects (tenant_id, target, owner_id, status);

ALTER TABLE core.file_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.file_objects FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS file_objects_tenant ON core.file_objects;
CREATE POLICY file_objects_tenant ON core.file_objects FOR ALL TO cc_app
  USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());

GRANT SELECT, INSERT, UPDATE ON core.file_objects TO cc_app;
