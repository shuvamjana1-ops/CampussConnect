-- Identity reveals (task 15.8; requirements 8.2, 8.8): lookup by revealed Handler, used by the reporter
-- visibility policy and the identity endpoint.

CREATE INDEX IF NOT EXISTS idx_confidential_reveals_handler
  ON tickets.confidential_reveals (tenant_id, handler_id, ticket_id);
