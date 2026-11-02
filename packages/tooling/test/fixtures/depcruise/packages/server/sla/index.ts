// Allowed: another module's index.ts and this module's own tables.
import { slaTables } from '../../db/src/schema/sla';
import { ticketService } from '../tickets';

export const slaService = { slaTables, ticketService };
