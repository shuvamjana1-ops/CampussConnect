-- Async runtime (requirement 24.6): transactional outbox, consumer idempotency and SLA/lifecycle timers.
-- The relay and the sweeper work across tenants, so they claim rows through SECURITY DEFINER functions that
-- use FOR UPDATE SKIP LOCKED. The application role never reads or updates these rows directly.

-- Domain events, written in the same transaction as the state change.
CREATE TABLE IF NOT EXISTS platform.outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  event_type text NOT NULL,
  event_version integer NOT NULL CHECK (event_version >= 1),
  queues text[] NOT NULL CHECK (cardinality(queues) >= 1),
  payload jsonb NOT NULL,
  occurred_at bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_until timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  published_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_outbox_unpublished
  ON platform.outbox (created_at, id) WHERE published_at IS NULL;

ALTER TABLE platform.outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY outbox_insert ON platform.outbox
  FOR INSERT TO cc_app WITH CHECK (tenant_id = app.tenant());

-- One row per (consumer, event) already applied. Written in the same transaction as the consumer's effect.
CREATE TABLE IF NOT EXISTS platform.processed_events (
  consumer text NOT NULL,
  event_id text NOT NULL,
  tenant_id uuid NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer, event_id)
);

CREATE INDEX IF NOT EXISTS idx_processed_events_processed_at
  ON platform.processed_events (processed_at);

ALTER TABLE platform.processed_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY processed_events_select ON platform.processed_events
  FOR SELECT TO cc_app USING (tenant_id = app.tenant());
CREATE POLICY processed_events_insert ON platform.processed_events
  FOR INSERT TO cc_app WITH CHECK (tenant_id = app.tenant());

-- Deadlines. Recalculating a clock upserts the row and increments `generation`.
CREATE TABLE IF NOT EXISTS platform.timers (
  tenant_id uuid NOT NULL,
  ticket_id uuid NOT NULL,
  kind text NOT NULL,
  due_at timestamptz NOT NULL,
  generation integer NOT NULL DEFAULT 1 CHECK (generation >= 1),
  claimed_until timestamptz,
  enqueued_generation integer, -- the generation last handed to the queue; NULL until then
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, ticket_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_timers_due
  ON platform.timers (due_at) WHERE enqueued_generation IS DISTINCT FROM generation;

ALTER TABLE platform.timers ENABLE ROW LEVEL SECURITY;
CREATE POLICY timers_tenant ON platform.timers
  FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());

-- Claims a batch of unpublished events. A lease (rather than a held transaction) keeps the row locked out of
-- other relays while the batch is published to SQS; an expired lease makes the row claimable again.
CREATE OR REPLACE FUNCTION platform.claim_outbox(batch_size integer, lease_seconds integer DEFAULT 60)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  event_type text,
  event_version integer,
  queues text[],
  payload jsonb,
  occurred_at bigint,
  attempts integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
  UPDATE platform.outbox o
  SET claimed_until = now() + make_interval(secs => lease_seconds),
      attempts = o.attempts + 1
  WHERE o.id IN (
    SELECT c.id FROM platform.outbox c
    WHERE c.published_at IS NULL
      AND (c.claimed_until IS NULL OR c.claimed_until < now())
    ORDER BY c.created_at, c.id
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING o.id, o.tenant_id, o.event_type, o.event_version, o.queues, o.payload, o.occurred_at, o.attempts
$$;

CREATE OR REPLACE FUNCTION platform.mark_outbox_published(event_ids uuid[])
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
  WITH done AS (
    UPDATE platform.outbox
    SET published_at = now(), claimed_until = NULL
    WHERE id = ANY(event_ids) AND published_at IS NULL
    RETURNING 1
  )
  SELECT count(*)::integer FROM done
$$;

-- Releases the lease on events whose publication failed so the next pass can retry them.
CREATE OR REPLACE FUNCTION platform.release_outbox(event_ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
  UPDATE platform.outbox SET claimed_until = NULL WHERE id = ANY(event_ids) AND published_at IS NULL
$$;

-- Claims timers that are due and whose current generation has not been handed to the queue.
CREATE OR REPLACE FUNCTION platform.claim_due_timers(batch_size integer, lease_seconds integer DEFAULT 60)
RETURNS TABLE (
  tenant_id uuid,
  ticket_id uuid,
  kind text,
  due_at timestamptz,
  generation integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
  UPDATE platform.timers t
  SET claimed_until = now() + make_interval(secs => lease_seconds)
  WHERE (t.tenant_id, t.ticket_id, t.kind) IN (
    SELECT c.tenant_id, c.ticket_id, c.kind FROM platform.timers c
    WHERE c.due_at <= now()
      AND c.enqueued_generation IS DISTINCT FROM c.generation
      AND (c.claimed_until IS NULL OR c.claimed_until < now())
    ORDER BY c.due_at
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING t.tenant_id, t.ticket_id, t.kind, t.due_at, t.generation
$$;

-- Records that a generation reached the queue. A newer generation written meanwhile stays pending.
CREATE OR REPLACE FUNCTION platform.mark_timer_enqueued(
  p_tenant_id uuid, p_ticket_id uuid, p_kind text, p_generation integer
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
  UPDATE platform.timers
  SET enqueued_generation = p_generation, claimed_until = NULL
  WHERE tenant_id = p_tenant_id AND ticket_id = p_ticket_id AND kind = p_kind AND generation = p_generation
$$;

CREATE OR REPLACE FUNCTION platform.release_timer(p_tenant_id uuid, p_ticket_id uuid, p_kind text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
  UPDATE platform.timers SET claimed_until = NULL
  WHERE tenant_id = p_tenant_id AND ticket_id = p_ticket_id AND kind = p_kind
$$;

REVOKE ALL ON platform.outbox, platform.processed_events, platform.timers FROM PUBLIC;
GRANT INSERT ON platform.outbox TO cc_app;
GRANT SELECT, INSERT ON platform.processed_events TO cc_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON platform.timers TO cc_app;

REVOKE ALL ON FUNCTION
  platform.claim_outbox(integer, integer),
  platform.mark_outbox_published(uuid[]),
  platform.release_outbox(uuid[]),
  platform.claim_due_timers(integer, integer),
  platform.mark_timer_enqueued(uuid, uuid, text, integer),
  platform.release_timer(uuid, uuid, text)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  platform.claim_outbox(integer, integer),
  platform.mark_outbox_published(uuid[]),
  platform.release_outbox(uuid[]),
  platform.claim_due_timers(integer, integer),
  platform.mark_timer_enqueued(uuid, uuid, text, integer),
  platform.release_timer(uuid, uuid, text)
TO cc_app;

-- RLS lint: explicit statements for static analysis
ALTER TABLE platform.outbox FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.processed_events FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.timers FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON platform.outbox AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
CREATE POLICY tenant_isolation ON platform.processed_events AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
