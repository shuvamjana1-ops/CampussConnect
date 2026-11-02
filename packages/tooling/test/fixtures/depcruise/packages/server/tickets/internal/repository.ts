// Allowed: a module uses its own tables.
import { tickets } from '../../../db/src/schema/tickets';

export const findTicket = () => tickets;
