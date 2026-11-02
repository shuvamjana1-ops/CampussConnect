// @campusconnect/server/tickets: Ticket creation, receipts and the Ticket schema.

export { TicketCreationService, type TicketCreationOptions } from './ticket-creation';
export {
  ticketRoutes,
  toTicketProblem,
  type TicketErrorMapping,
  type TicketRoute,
  type TicketRouteRequest,
} from './tickets.routes';
export * from './tickets.types';

// Ticket commands, messages and Student views (15.7).
export { TicketCommandService, type TicketCommandServiceOptions } from './ticket-commands';
export { ticketCommandRoutes, type TicketCommandRoute } from './ticket-commands.routes';
export * from './ticket-commands.types';

// Confidentiality and Grievance Committee endpoints (15.8).
export { GrievanceService, type GrievanceServiceOptions } from './grievances';
export { grievanceRoutes, type GrievanceRoute } from './grievances.routes';
export * from './grievances.types';
