// Allowed: Analytics reads its own fact tables and calls a foundation module.
import { ticketFacts } from '../../db/src/schema/analytics';
import { identityService } from '../identity';

export const analyticsService = { identityService, ticketFacts };
