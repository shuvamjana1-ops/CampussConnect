// Allowed: apps use a server module and a domain module through their index.ts.
import { workingTime } from '../../../packages/domain/src/calendar';
import { ticketService } from '../../../packages/server/tickets';

export const wired = [ticketService, workingTime];
