-- Notification_Service tables (requirements 9.1, 9.2, 9.4, 9.5, 9.6, 9.8): the logical notification (always stored, so it
-- is the in-app inbox), one delivery row per channel, failure records for the Tenant_Admin, per-user preferences and
-- Web Push subscriptions. Every table carries tenant_id, leads its indexes with it and is protected by forced
-- row-level security with a restrictive tenant policy.

CREATE SCHEMA IF NOT EXISTS notify;
GRANT USAGE ON SCHEMA notify TO cc_owner, cc_app, cc_reader, cc_definer;

CREATE TABLE IF NOT EXISTS notify.notifications (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  -- Template event (`ticket_status_changed`, `emergency_alert`, ...) and the parameters it renders with.
  -- Ticket and Grievance params hold only { ticketRef, statusLabel, deepLink, locale } (9.7).
  event text NOT NULL CHECK (event IN (
    'ticket_created', 'ticket_routed', 'ticket_status_changed', 'ticket_assignment_changed',
    'grievance_status_changed', 'opportunity_published', 'emergency_alert'
  )),
  params jsonb NOT NULL,
  emergency boolean NOT NULL DEFAULT false,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  deep_link text CHECK (length(deep_link) <= 2048),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Retained for 30 days from creation (9.8). Hours rather than days so the value does not depend on the session time zone.
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '720 hours'),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, user_id) REFERENCES core.users (tenant_id, id) ON DELETE CASCADE,
  CHECK (expires_at = created_at + interval '720 hours')
);

CREATE INDEX IF NOT EXISTS idx_notifications_inbox
  ON notify.notifications (tenant_id, user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notify.notifications (tenant_id, user_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_expiry
  ON notify.notifications (expires_at);

CREATE TABLE IF NOT EXISTS notify.notification_deliveries (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('in_app', 'web_push', 'email', 'sms')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz,
  last_error_code text CHECK (length(last_error_code) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  -- One row per channel per notification: a fallback never repeats a channel that was already attempted.
  UNIQUE (tenant_id, notification_id, channel),
  FOREIGN KEY (tenant_id, notification_id) REFERENCES notify.notifications (tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_pending
  ON notify.notification_deliveries (tenant_id, next_attempt_at) WHERE status = 'pending';

-- Written once when every channel failed after retries (9.6). The notification stays unread in the inbox.
CREATE TABLE IF NOT EXISTS notify.notification_failures (
  tenant_id uuid NOT NULL,
  notification_id uuid NOT NULL,
  failed_channels text[] NOT NULL CHECK (cardinality(failed_channels) >= 1),
  at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, notification_id),
  FOREIGN KEY (tenant_id, notification_id) REFERENCES notify.notifications (tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notification_failures_at ON notify.notification_failures (tenant_id, at DESC);

CREATE TABLE IF NOT EXISTS notify.notification_prefs (
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  in_app boolean NOT NULL DEFAULT true,
  web_push boolean NOT NULL DEFAULT true,
  email boolean NOT NULL DEFAULT true,
  -- Quiet hours in the Tenant's time zone; push and email are deferred inside them. Both null means none.
  quiet_start time,
  quiet_end time,
  weekly_opportunity_digest boolean NOT NULL DEFAULT false,
  locale text NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'hi')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id),
  FOREIGN KEY (tenant_id, user_id) REFERENCES core.users (tenant_id, id) ON DELETE CASCADE,
  CHECK ((quiet_start IS NULL) = (quiet_end IS NULL))
);

CREATE TABLE IF NOT EXISTS notify.push_subscriptions (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL CHECK (length(endpoint) BETWEEN 1 AND 2048),
  p256dh text NOT NULL CHECK (length(p256dh) BETWEEN 1 AND 512),
  auth text NOT NULL CHECK (length(auth) BETWEEN 1 AND 512),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, user_id, endpoint),
  FOREIGN KEY (tenant_id, user_id) REFERENCES core.users (tenant_id, id) ON DELETE CASCADE
);

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['notifications', 'notification_deliveries', 'notification_failures', 'notification_prefs', 'push_subscriptions']
  LOOP
    EXECUTE format('ALTER TABLE notify.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE notify.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON notify.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON notify.%I AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant())',
      t
    );
    EXECUTE format('DROP POLICY IF EXISTS tenant_access ON notify.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_access ON notify.%I AS PERMISSIVE FOR ALL TO cc_app USING (true) WITH CHECK (true)',
      t
    );
    EXECUTE format('REVOKE ALL ON notify.%I FROM PUBLIC', t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE ON notify.notifications TO cc_app;
GRANT SELECT, INSERT, UPDATE ON notify.notification_deliveries TO cc_app;
GRANT SELECT, INSERT ON notify.notification_failures TO cc_app;
GRANT SELECT, INSERT, UPDATE ON notify.notification_prefs TO cc_app;
GRANT SELECT, INSERT, DELETE ON notify.push_subscriptions TO cc_app;

-- RLS lint: explicit statements for static analysis
ALTER TABLE notify.notifications FORCE ROW LEVEL SECURITY;
ALTER TABLE notify.notification_deliveries FORCE ROW LEVEL SECURITY;
ALTER TABLE notify.notification_failures FORCE ROW LEVEL SECURITY;
ALTER TABLE notify.notification_prefs FORCE ROW LEVEL SECURITY;
ALTER TABLE notify.push_subscriptions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON notify.notifications;
CREATE POLICY tenant_isolation ON notify.notifications AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS tenant_isolation ON notify.notification_deliveries;
CREATE POLICY tenant_isolation ON notify.notification_deliveries AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS tenant_isolation ON notify.notification_failures;
CREATE POLICY tenant_isolation ON notify.notification_failures AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS tenant_isolation ON notify.notification_prefs;
CREATE POLICY tenant_isolation ON notify.notification_prefs AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS tenant_isolation ON notify.push_subscriptions;
CREATE POLICY tenant_isolation ON notify.push_subscriptions AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
