-- Grievance Committee L3 list (task 15.8; requirement 8.4): open L3 Tickets by Tenant.

CREATE INDEX IF NOT EXISTS idx_tickets_l3_open
  ON tickets.tickets (tenant_id, created_at, id)
  WHERE escalation_level = 3 AND is_open;
