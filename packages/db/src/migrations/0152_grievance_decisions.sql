-- Grievance Committee decisions (task 15.8; requirement 8.5): the rationale is 20 to 5,000 characters, so the
-- 2,000-character limit from the base schema is replaced, and decisions get an id and a lookup index.

DO $$
DECLARE
  c text;
BEGIN
  FOR c IN
    SELECT con.conname FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid = rel.relnamespace
     WHERE ns.nspname = 'tickets' AND rel.relname = 'ombudsperson_decisions' AND con.contype = 'c'
       AND pg_get_constraintdef(con.oid) LIKE '%rationale%'
  LOOP
    EXECUTE format('ALTER TABLE tickets.ombudsperson_decisions DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE tickets.ombudsperson_decisions
  ADD CONSTRAINT ombudsperson_decisions_rationale_length CHECK (length(rationale) BETWEEN 20 AND 5000);

ALTER TABLE tickets.ombudsperson_decisions
  ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS idx_ombudsperson_decisions_ticket
  ON tickets.ombudsperson_decisions (tenant_id, ticket_id, at DESC);
