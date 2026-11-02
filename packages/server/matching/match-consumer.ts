// The `match` queue consumer (11.1, 11.7): matches all Students on publication, drops matches on expiry and re-matches
// one Student when the profile changes. Consent withdrawal, which removes the income band, arrives as ProfileChanged.

import type { DomainEventOf } from '@campusconnect/contracts';
import {
  OutboxEventConsumer,
  type OutboxDatabase,
  type OutboxSqlClient,
  type QueueClient,
  type QueueConsumerOptions,
} from '../outbox';
import { Matcher } from './matcher';
import { DEFAULT_MATCH_SETTINGS, MATCH_QUEUE, type MatchSettings } from './matching.types';

const MATCH_EVENT_TYPES = ['OpportunityPublished', 'OpportunityExpired', 'ProfileChanged'] as const;
type MatchEventType = (typeof MATCH_EVENT_TYPES)[number];

export class MatchConsumer extends OutboxEventConsumer<MatchEventType> {
  readonly consumer = 'match';
  readonly queue = MATCH_QUEUE;
  readonly eventTypes = MATCH_EVENT_TYPES;
  private readonly matcher: Matcher;

  constructor(
    db: OutboxDatabase,
    client: QueueClient,
    options: QueueConsumerOptions = {},
    settings: MatchSettings = DEFAULT_MATCH_SETTINGS,
  ) {
    super(db, client, options);
    this.matcher = new Matcher(settings);
  }

  protected async handle(tx: OutboxSqlClient, event: DomainEventOf<MatchEventType>): Promise<void> {
    switch (event.type) {
      case 'OpportunityPublished':
        await this.matcher.matchOpportunity(tx, event.tenantId, event.payload.opportunityId);
        return;
      case 'OpportunityExpired':
        await this.matcher.clearOpportunity(tx, event.tenantId, event.payload.opportunityId);
        return;
      case 'ProfileChanged':
        await this.matcher.matchStudent(tx, event.tenantId, event.payload.studentId);
        return;
    }
  }
}
