// `triage` consumer: classifies a new Ticket and routes it (5.1, 5.3 to 5.7, 5.10, 23.7, 24.5).
// Triage is advisory: the only change it makes is the New -> Assigned routing command (5.9).

import type { AiAdapter } from '@campusconnect/ai-adapter';
import {
  decideTriage,
  safetySignal,
  type AiTriageOutput,
  type TriageBand,
  type TriageDecision,
} from '@campusconnect/domain/triage';
import type { PiiRedactor, RedactedText } from '@campusconnect/pii-redactor';
import type { DependencyHealth } from '../health';
import { enqueueEvent, cancelTimer } from '../outbox';
import { OutboxEventConsumer, type MessageResult, type QueueConsumerOptions } from '../outbox/queue-consumer';
import type { OutboxDatabase, OutboxSqlClient, QueueClient } from '../outbox/outbox.types';
import type { P0Escalator } from './p0-escalation';
import {
  TRIAGE_AI_TIMEOUT_MS,
  TRIAGE_DEADLINE_KIND,
  TRIAGE_QUEUE,
  TRIAGE_REDACTION_DEADLINE_MS,
  runWithAiTenant,
  withTimeout,
} from './triage.types';

type CreatedEvent = Extract<import('@campusconnect/contracts').DomainEvent, { type: 'TicketCreated' }>;

interface TicketFacts {
  title: string;
  description_redacted: string | null;
  status: string;
  band: TriageBand;
  category_id: string;
  has_result: boolean;
}

interface TenantSettings {
  confidence_threshold: string;
  default_department_id: string | null;
}

interface CategoryRow {
  id: string;
  name: string;
  default_band: TriageBand;
  default_department_id: string | null;
}

interface PendingEscalation {
  readonly ticketId: string;
  readonly departmentId: string;
}

export interface TriageConsumerDeps {
  readonly redactor: PiiRedactor;
  readonly ai: AiAdapter;
  readonly health: DependencyHealth;
  readonly escalator: P0Escalator;
}

export class TriageConsumer extends OutboxEventConsumer<'TicketCreated'> {
  readonly consumer = 'triage.ticket-created';
  readonly queue = TRIAGE_QUEUE;
  readonly eventTypes = ['TicketCreated'] as const;

  private readonly pending = new Map<string, PendingEscalation>();

  constructor(
    db: OutboxDatabase,
    client: QueueClient,
    private readonly deps: TriageConsumerDeps,
    options: QueueConsumerOptions = {},
  ) {
    super(db, client, options);
  }

  /** P0 notification runs after the routing commit, so its retries never hold the transaction open. */
  override async process(body: string): Promise<MessageResult> {
    const result = await super.process(body);
    const decoded = this.decode(body);
    const escalation = this.pending.get(decoded.eventId);
    this.pending.delete(decoded.eventId);
    if (result === 'applied' && escalation !== undefined) {
      await this.deps.escalator.escalate(decoded.tenantId, escalation.ticketId, escalation.departmentId);
    }
    return result;
  }

  protected async handle(tx: OutboxSqlClient, event: CreatedEvent): Promise<void> {
    const { tenantId } = event;
    const { ticketId } = event.payload;

    const facts = (
      await tx.query<TicketFacts>(`SELECT * FROM triage.ticket_for_triage($1::uuid)`, [ticketId])
    ).rows[0];
    if (facts === undefined || facts.status !== 'New' || facts.has_result) return;
    const text = (await tx.query<{ t: string }>(`SELECT triage.ticket_local_text($1::uuid) AS t`, [ticketId])).rows[0]?.t ?? '';

    const settings = (
      await tx.query<TenantSettings>(
        `SELECT confidence_threshold::text, default_department_id::text FROM core.tenant_config WHERE tenant_id = $1::uuid`,
        [tenantId],
      )
    ).rows[0];
    const categories = (
      await tx.query<CategoryRow>(
        `SELECT id::text, name, default_band, default_department_id::text FROM core.categories
         WHERE tenant_id = $1::uuid AND active ORDER BY name`,
        [tenantId],
      )
    ).rows;
    const departments = (
      await tx.query<{ id: string; name: string }>(
        `SELECT id::text, name FROM core.departments WHERE tenant_id = $1::uuid AND active ORDER BY name`,
        [tenantId],
      )
    ).rows;
    const rules = (
      await tx.query<{ category_id: string; department_id: string; keywords: string[] }>(
        `SELECT category_id::text, department_id::text, keywords FROM core.routing_rules
         WHERE tenant_id = $1::uuid ORDER BY rank`,
        [tenantId],
      )
    ).rows;
    if (categories.length === 0 || departments.length === 0) throw new Error('Triage needs active categories and departments.');

    const category = categories.find((c) => c.id === facts.category_id) ?? categories[0]!;
    const defaultDepartmentId =
      [settings?.default_department_id, category.default_department_id].find(
        (id): id is string => id != null && departments.some((d) => d.id === id),
      ) ?? departments[0]!.id;

    const redacted = await this.redact(tenantId, text);
    let decision: TriageDecision;
    let source: 'ai' | 'rules' | 'default';
    if (redacted === null) {
      // Redaction failed: no AI call (5.3). Route to the default department for verification.
      const safety = safetySignal(text) !== null;
      decision = {
        categoryId: category.id,
        categoryConfidence: 0,
        departmentId: defaultDepartmentId,
        departmentConfidence: 0,
        band: safety ? 'P0' : (facts.band ?? category.default_band),
        safetyForcedP0: safety,
        needsVerification: true,
        source: 'rules',
        command: { from: 'New', to: 'Assigned' },
      };
      source = 'default';
    } else {
      const ai = await this.callAi(tenantId, redacted, categories, departments);
      decision = decideTriage({
        ai,
        text,
        categories: categories.map((c) => ({
          id: c.id,
          defaultBand: c.default_band,
          ...(c.default_department_id ? { defaultDepartmentId: c.default_department_id } : {}),
        })),
        departmentIds: departments.map((d) => d.id),
        routingRules: rules.map((r) => ({ categoryId: r.category_id, departmentId: r.department_id, keywords: r.keywords })),
        defaultDepartmentId,
        threshold: Number(settings?.confidence_threshold ?? 0.7),
      });
      source = decision.source;
    }

    const applied = (
      await tx.query<{ applied: boolean; assignee_id: string | null }>(
        `SELECT * FROM triage.apply_result($1::uuid, $2::uuid, $3, $4::uuid, $5, $6, $7, $8, $9)`,
        [
          ticketId,
          decision.categoryId,
          decision.categoryConfidence,
          decision.departmentId,
          decision.departmentConfidence,
          decision.band,
          decision.safetyForcedP0,
          decision.needsVerification,
          source,
        ],
      )
    ).rows[0];
    if (applied === undefined || !applied.applied) return;

    await enqueueEvent(tx, {
      tenantId,
      type: 'TicketRouted',
      version: 1,
      payload: { ticketId, departmentId: decision.departmentId },
    });
    if (applied.assignee_id !== null) await cancelTimer(tx, { tenantId, ticketId, kind: TRIAGE_DEADLINE_KIND });
    if (decision.band === 'P0') this.pending.set(event.id, { ticketId, departmentId: decision.departmentId });
  }

  /** Null when redaction fails or exceeds its 2-second deadline. */
  private async redact(tenantId: string, text: string): Promise<RedactedText | null> {
    try {
      const result = await this.deps.redactor.redact(text, { tenantId, deadlineMs: TRIAGE_REDACTION_DEADLINE_MS });
      return result.text;
    } catch {
      return null;
    }
  }

  /** `classify` (Categories and Departments) and `scorePriority` in parallel. Null when every call failed. */
  private async callAi(
    tenantId: string,
    text: RedactedText,
    categories: readonly CategoryRow[],
    departments: ReadonlyArray<{ id: string; name: string }>,
  ): Promise<AiTriageOutput | null> {
    const opts = { timeoutMs: TRIAGE_AI_TIMEOUT_MS };
    const run = async <T>(call: () => Promise<{ type: 'success'; data: T } | { type: 'error' }>): Promise<T | null> => {
      try {
        const result = await withTimeout(runWithAiTenant(tenantId, call), TRIAGE_AI_TIMEOUT_MS);
        this.deps.health.record('ai', result.type === 'success' ? 'success' : 'failure');
        return result.type === 'success' ? result.data : null;
      } catch {
        this.deps.health.record('ai', 'failure');
        return null;
      }
    };
    const [cats, depts, priority] = await Promise.all([
      run(() =>
        this.deps.ai.classify(
          { purpose: 'triage', text, labels: categories.map((c) => ({ id: c.id, description: c.name })) },
          opts,
        ),
      ),
      run(() =>
        this.deps.ai.classify(
          { purpose: 'triage', text, labels: departments.map((d) => ({ id: d.id, description: d.name })) },
          opts,
        ),
      ),
      run(() => this.deps.ai.scorePriority({ text }, opts)),
    ]);
    if (cats === null && depts === null && priority === null) return null;
    return {
      ...(cats ? { categoryScores: cats.scores.map((s) => ({ label: s.id, score: s.confidence })) } : {}),
      ...(depts ? { departmentScores: depts.scores.map((s) => ({ label: s.id, score: s.confidence })) } : {}),
      ...(priority ? { band: priority.band, safetyRisk: priority.safetyRisk } : {}),
    };
  }
}
