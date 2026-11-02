// SLA clocks: start, pause, resume, stop, band change, first response and recalculation. Every operation runs in the
// caller's Tenant-scoped transaction and ends by refreshing the cached due columns, `sort_due_at` and the timers
// (upsert with generation), so a stale queued timer message is ignored (4.4, 4.5, 6.1, 6.2, 6.8, 6.9, 6.12).

import {
  CalendarHasNoWorkingTime,
  addWorkingSeconds,
  type IsoWeekday,
  type WorkingCalendar,
  type WorkingWindow,
} from '@campusconnect/domain/calendar';
import {
  changeBand,
  deriveTimers,
  firstResponseMinutes,
  freshClock,
  instantAtElapsed,
  l3ReviewDeadline,
  modeForBand,
  pauseClock,
  recordFirstResponse,
  resumeClock,
  startClock,
  stopClock,
  thresholds,
  type SlaBudgets,
  type SlaClock,
  type SlaClockState,
  type SlaSegment,
  type TimerKind,
} from '@campusconnect/domain/sla';
import type { Instant } from '@campusconnect/domain/types';
import { cancelTimer, upsertTimer, type OutboxSqlClient } from '../outbox';
import { SLA_TIMER_KINDS, type SlaNotifier, type SlaUnconfiguredReason } from './sla.types';

const WEEKDAYS: readonly IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];
const SECONDS_PER_MINUTE = 60;

export interface SlaEngineOptions {
  readonly notifier: SlaNotifier;
}

interface TicketFacts {
  band: string;
  status: string;
  category_id: string;
  is_open: boolean;
}

interface ClockRow {
  mode: 'working' | 'continuous';
  band: string;
  state: SlaClockState;
  first_response_sec: number;
  resolution_sec: number;
  l1_sec: number;
  l2_sec: number;
  carried_sec: number;
  first_response_ms: string | number | null;
  first_response_elapsed_sec: number | null;
  first_response_met: boolean | null;
  awaiting_student_ms: string | number | null;
  resolved_ms: string | number | null;
  l3_escalated_ms: string | number | null;
}

interface SegmentRow {
  start_ms: string | number;
  end_ms: string | number | null;
}

interface CalendarRow {
  time_zone: string;
  weekly: Partial<Record<string, readonly WorkingWindow[]>>;
  holidays: string[];
}

/** A stored clock together with the Ticket facts that the non-clock timers need. */
interface LoadedClock {
  readonly clock: SlaClock;
  readonly band: string;
  readonly awaitingStudentSince: Instant | null;
  readonly resolvedAt: Instant | null;
  readonly l3EscalatedAt: Instant | null;
}

type Unconfigured = { readonly reason: SlaUnconfiguredReason };

const toMs = (v: string | number | null): Instant | null => (v === null ? null : (Number(v) as Instant));

export class SlaEngine {
  constructor(private readonly options: SlaEngineOptions) {}

  /** Starts the clock when a Ticket is routed. Does nothing when a clock exists, so redelivery is harmless. */
  async start(tx: OutboxSqlClient, tenantId: string, ticketId: string, now: Instant): Promise<void> {
    await cancelTimer(tx, { tenantId, ticketId, kind: 'triage_deadline' });
    if ((await this.loadClock(tx, tenantId, ticketId)) !== undefined) return;
    const facts = await this.facts(tx, ticketId);
    if (facts === undefined) return;
    const setup = await this.setup(tx, tenantId, ticketId, facts.band, facts.category_id, now);
    if ('reason' in setup) return this.flagUnconfigured(tx, tenantId, ticketId, setup.reason);
    const clock = startClock(now, setup.budgets, modeForBand(facts.band));
    await this.save(tx, tenantId, ticketId, { clock, band: facts.band, awaitingStudentSince: null, resolvedAt: null, l3EscalatedAt: null }, setup.calendar);
  }

  /** Pauses while the Ticket awaits the Student (4.4) and records the pause. */
  async pause(tx: OutboxSqlClient, tenantId: string, ticketId: string, now: Instant, reason: string): Promise<void> {
    const loaded = await this.loadClock(tx, tenantId, ticketId);
    if (loaded === undefined) return;
    const paused = pauseClock(loaded.clock, now);
    if (paused !== loaded.clock) {
      await tx.query(
        `INSERT INTO sla.sla_pauses (tenant_id, ticket_id, paused_at, reason)
         VALUES ($1::uuid, $2::uuid, to_timestamp($3::double precision / 1000.0), $4)`,
        [tenantId, ticketId, now, reason],
      );
    }
    await this.persist(tx, tenantId, ticketId, { ...loaded, clock: paused, awaitingStudentSince: loaded.awaitingStudentSince ?? now });
  }

  /** Resumes when the Student replies (4.5) and records the paused duration. */
  async resume(tx: OutboxSqlClient, tenantId: string, ticketId: string, now: Instant): Promise<void> {
    const loaded = await this.loadClock(tx, tenantId, ticketId);
    if (loaded === undefined) return;
    const resumed = resumeClock(loaded.clock, now);
    if (resumed !== loaded.clock) {
      await tx.query(
        `UPDATE sla.sla_pauses
            SET resumed_at = to_timestamp($3::double precision / 1000.0),
                paused_sec = GREATEST(0, floor(($3::double precision - extract(epoch FROM paused_at) * 1000) / 1000))::integer
          WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid AND resumed_at IS NULL`,
        [tenantId, ticketId, now],
      );
    }
    await this.persist(tx, tenantId, ticketId, { ...loaded, clock: resumed, awaitingStudentSince: null });
  }

  /** Stops the clock when the Ticket is resolved or closed. `resolved` starts the confirmation window. */
  async stop(tx: OutboxSqlClient, tenantId: string, ticketId: string, now: Instant, resolved: boolean): Promise<void> {
    const loaded = await this.loadClock(tx, tenantId, ticketId);
    if (loaded === undefined) return;
    await this.persist(tx, tenantId, ticketId, {
      ...loaded,
      clock: stopClock(loaded.clock, now),
      awaitingStudentSince: null,
      resolvedAt: resolved ? now : null,
    });
  }

  /** A reopen starts a fresh clock at 50% of every budget (4.10). */
  async reopen(tx: OutboxSqlClient, tenantId: string, ticketId: string, now: Instant): Promise<void> {
    const facts = await this.facts(tx, ticketId);
    if (facts === undefined) return;
    const setup = await this.setup(tx, tenantId, ticketId, facts.band, facts.category_id, now);
    if ('reason' in setup) return this.flagUnconfigured(tx, tenantId, ticketId, setup.reason);
    const clock = freshClock(now, setup.budgets, modeForBand(facts.band));
    await tx.query('SELECT sla.reset_escalation($1::uuid)', [ticketId]);
    await this.save(tx, tenantId, ticketId, { clock, band: facts.band, awaitingStudentSince: null, resolvedAt: null, l3EscalatedAt: null }, setup.calendar);
  }

  /** Band change: elapsed time carries over, the mode and budgets switch (6.9). */
  async changeBand(tx: OutboxSqlClient, tenantId: string, ticketId: string, now: Instant, newBand: string): Promise<void> {
    const loaded = await this.loadClock(tx, tenantId, ticketId);
    if (loaded === undefined) return;
    const facts = await this.facts(tx, ticketId);
    if (facts === undefined) return;
    const setup = await this.setup(tx, tenantId, ticketId, newBand, facts.category_id, now);
    if ('reason' in setup) return this.flagUnconfigured(tx, tenantId, ticketId, setup.reason);
    const clock = changeBand(loaded.clock, setup.calendar, now, newBand, setup.budgets);
    await this.persist(tx, tenantId, ticketId, { ...loaded, clock, band: newBand }, setup.calendar);
  }

  /** Recalculates caches and timers, e.g. after an assignment change or a calendar edit. */
  async recalculate(tx: OutboxSqlClient, tenantId: string, ticketId: string): Promise<void> {
    const loaded = await this.loadClock(tx, tenantId, ticketId);
    if (loaded === undefined) return;
    await this.persist(tx, tenantId, ticketId, loaded);
  }

  /** The instant the clock reaches the L2 threshold: the interim ETA given to the Student at an L1 breach (6.4). */
  async interimEta(tx: OutboxSqlClient, tenantId: string, ticketId: string): Promise<Instant | null> {
    const loaded = await this.loadClock(tx, tenantId, ticketId);
    if (loaded === undefined) return null;
    const calendar = await this.loadCalendar(tx);
    if ('reason' in calendar) return null;
    return instantAtElapsed(loaded.clock, calendar, thresholds(loaded.clock.budgets).l2Sec) ?? null;
  }

  /** Records the L3 escalation time and arms the `l3_review_due` timer (6.7). Does nothing when already recorded. */
  async markL3Escalated(tx: OutboxSqlClient, tenantId: string, ticketId: string, at: Instant): Promise<Instant | null> {
    const loaded = await this.loadClock(tx, tenantId, ticketId);
    if (loaded === undefined) return null;
    const calendar = await this.loadCalendar(tx);
    if ('reason' in calendar) return null;
    const escalatedAt = loaded.l3EscalatedAt ?? at;
    if (loaded.l3EscalatedAt !== null) return l3ReviewDeadline(escalatedAt, calendar);
    await tx.query(
      `UPDATE sla.sla_clocks SET l3_escalated_at = to_timestamp($3::double precision / 1000.0)
        WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid`,
      [tenantId, ticketId, at],
    );
    await this.persist(tx, tenantId, ticketId, { ...loaded, l3EscalatedAt: at }, calendar);
    return l3ReviewDeadline(at, calendar);
  }

  /**
   * Evaluates the first public Handler message (6.8). Call it from the message path in the same transaction.
   * Only the first response counts; the elapsed time is stored in seconds and whole minutes.
   */
  async recordFirstResponse(tx: OutboxSqlClient, tenantId: string, ticketId: string, at: Instant): Promise<void> {
    const loaded = await this.loadClock(tx, tenantId, ticketId);
    if (loaded === undefined || loaded.clock.firstResponse !== undefined) return;
    const calendar = await this.loadCalendar(tx);
    if ('reason' in calendar) return;
    const clock = recordFirstResponse(loaded.clock, calendar, at);
    const response = clock.firstResponse;
    if (response === undefined) return;
    await tx.query(
      `UPDATE sla.sla_clocks
          SET first_response_at = to_timestamp($3::double precision / 1000.0),
              first_response_elapsed_sec = $4, first_response_min = $5, first_response_met = $6, updated_at = now()
        WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid`,
      [tenantId, ticketId, response.at, response.elapsedSec, firstResponseMinutes(response), response.met],
    );
    await this.persist(tx, tenantId, ticketId, { ...loaded, clock }, calendar);
  }

  private async facts(tx: OutboxSqlClient, ticketId: string): Promise<TicketFacts | undefined> {
    const result = await tx.query<TicketFacts>(
      'SELECT band, status, category_id::text AS category_id, is_open FROM sla.ticket_facts($1::uuid)',
      [ticketId],
    );
    return result.rows[0];
  }

  /** Resolves the calendar and budgets, or the reason the Ticket cannot have a clock (6.12). */
  private async setup(
    tx: OutboxSqlClient,
    _tenantId: string,
    _ticketId: string,
    band: string,
    categoryId: string,
    now: Instant,
  ): Promise<{ calendar: WorkingCalendar; budgets: SlaBudgets } | Unconfigured> {
    const calendar = await this.loadCalendar(tx);
    if ('reason' in calendar) return calendar;
    try {
      addWorkingSeconds(now, 0, calendar, modeForBand(band));
    } catch (error) {
      if (error instanceof CalendarHasNoWorkingTime) return { reason: 'no_working_time' };
      throw error;
    }
    const policy = await tx.query<{ first_response_min: number; resolution_min: number; l1_min: number; l2_min: number }>(
      `SELECT first_response_min, resolution_min, l1_min, l2_min
         FROM core.sla_policies
        WHERE band = $1 AND (category_id = $2::uuid OR category_id IS NULL)
        ORDER BY (category_id IS NULL)
        LIMIT 1`,
      [band, categoryId],
    );
    const row = policy.rows[0];
    if (row === undefined) return { reason: 'policy_missing' };
    return {
      calendar,
      budgets: {
        firstResponseSec: row.first_response_min * SECONDS_PER_MINUTE,
        resolutionSec: row.resolution_min * SECONDS_PER_MINUTE,
        l1Sec: row.l1_min * SECONDS_PER_MINUTE,
        l2Sec: row.l2_min * SECONDS_PER_MINUTE,
      },
    };
  }

  private async loadCalendar(tx: OutboxSqlClient): Promise<WorkingCalendar | Unconfigured> {
    const result = await tx.query<CalendarRow>(
      `SELECT time_zone, weekly,
              ARRAY(SELECT to_char(d, 'YYYY-MM-DD') FROM unnest(holidays) AS d ORDER BY d) AS holidays
         FROM core.working_calendars`,
    );
    const row = result.rows[0];
    if (row === undefined) return { reason: 'calendar_missing' };
    const weekly = {} as Record<IsoWeekday, readonly WorkingWindow[]>;
    for (const day of WEEKDAYS) weekly[day] = row.weekly[String(day)] ?? [];
    if (WEEKDAYS.every((day) => weekly[day].length === 0)) return { reason: 'no_working_time' };
    return { timeZone: row.time_zone, weekly, holidays: row.holidays };
  }

  private async flagUnconfigured(tx: OutboxSqlClient, tenantId: string, ticketId: string, reason: SlaUnconfiguredReason): Promise<void> {
    await tx.query('SELECT sla.set_ticket_sla($1::uuid, NULL, true)', [ticketId]);
    for (const kind of SLA_TIMER_KINDS) await cancelTimer(tx, { tenantId, ticketId, kind });
    await this.options.notifier.slaUnconfigured({ tenantId, ticketId, reason });
  }

  private async loadClock(tx: OutboxSqlClient, tenantId: string, ticketId: string): Promise<LoadedClock | undefined> {
    const result = await tx.query<ClockRow>(
      `SELECT mode, band, state, first_response_sec, resolution_sec, l1_sec, l2_sec, carried_sec,
              (extract(epoch FROM first_response_at) * 1000)::bigint AS first_response_ms,
              first_response_elapsed_sec, first_response_met,
              (extract(epoch FROM awaiting_student_since) * 1000)::bigint AS awaiting_student_ms,
              (extract(epoch FROM resolved_at) * 1000)::bigint AS resolved_ms,
              (extract(epoch FROM l3_escalated_at) * 1000)::bigint AS l3_escalated_ms
         FROM sla.sla_clocks WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid`,
      [tenantId, ticketId],
    );
    const row = result.rows[0];
    if (row === undefined) return undefined;
    const segments = await tx.query<SegmentRow>(
      `SELECT (extract(epoch FROM start_at) * 1000)::bigint AS start_ms, (extract(epoch FROM end_at) * 1000)::bigint AS end_ms
         FROM sla.sla_segments WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid ORDER BY seq`,
      [tenantId, ticketId],
    );
    const firstResponseAt = toMs(row.first_response_ms);
    const clock: SlaClock = {
      mode: row.mode,
      budgets: { firstResponseSec: row.first_response_sec, resolutionSec: row.resolution_sec, l1Sec: row.l1_sec, l2Sec: row.l2_sec },
      carriedSec: row.carried_sec,
      state: row.state,
      segments: segments.rows.map((s): SlaSegment => {
        const end = toMs(s.end_ms);
        return end === null ? { start: Number(s.start_ms) as Instant } : { start: Number(s.start_ms) as Instant, end };
      }),
      ...(firstResponseAt === null
        ? {}
        : {
            firstResponse: {
              at: firstResponseAt,
              elapsedSec: row.first_response_elapsed_sec ?? 0,
              met: row.first_response_met ?? false,
            },
          }),
    };
    return {
      clock,
      band: row.band,
      awaitingStudentSince: toMs(row.awaiting_student_ms),
      resolvedAt: toMs(row.resolved_ms),
      l3EscalatedAt: toMs(row.l3_escalated_ms),
    };
  }

  /** Inserts or replaces the clock row, then refreshes caches and timers. */
  private async save(
    tx: OutboxSqlClient,
    tenantId: string,
    ticketId: string,
    loaded: LoadedClock,
    calendar: WorkingCalendar,
  ): Promise<void> {
    const c = loaded.clock;
    await tx.query(
      `INSERT INTO sla.sla_clocks
         (tenant_id, ticket_id, mode, band, state, first_response_sec, resolution_sec, l1_sec, l2_sec, carried_sec)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (tenant_id, ticket_id) DO UPDATE SET
         mode = EXCLUDED.mode, band = EXCLUDED.band, state = EXCLUDED.state,
         first_response_sec = EXCLUDED.first_response_sec, resolution_sec = EXCLUDED.resolution_sec,
         l1_sec = EXCLUDED.l1_sec, l2_sec = EXCLUDED.l2_sec, carried_sec = EXCLUDED.carried_sec,
         first_response_at = NULL, first_response_elapsed_sec = NULL, first_response_min = NULL,
         first_response_met = NULL, l3_escalated_at = NULL, started_at = now()`,
      [tenantId, ticketId, c.mode, loaded.band, c.state, c.budgets.firstResponseSec, c.budgets.resolutionSec, c.budgets.l1Sec, c.budgets.l2Sec, c.carriedSec],
    );
    await this.persist(tx, tenantId, ticketId, loaded, calendar);
  }

  /** Writes state, segments and event facts, then the cached due columns, `sort_due_at` and the timers. */
  private async persist(
    tx: OutboxSqlClient,
    tenantId: string,
    ticketId: string,
    loaded: LoadedClock,
    knownCalendar?: WorkingCalendar,
  ): Promise<void> {
    const calendar = knownCalendar ?? (await this.loadCalendar(tx));
    if ('reason' in calendar) return this.flagUnconfigured(tx, tenantId, ticketId, calendar.reason);
    const c = loaded.clock;
    const dueOf = (sec: number): Instant | undefined => instantAtElapsed(c, calendar, sec);
    const t = thresholds(c.budgets);
    const firstResponseDue = c.firstResponse === undefined ? dueOf(c.budgets.firstResponseSec) : undefined;
    const atRisk = dueOf(t.atRiskSec);
    const resolutionDue = dueOf(t.l1Sec);

    await tx.query(
      `UPDATE sla.sla_clocks SET
         mode = $3, band = $4, state = $5, first_response_sec = $6, resolution_sec = $7, l1_sec = $8, l2_sec = $9,
         carried_sec = $10,
         awaiting_student_since = CASE WHEN $11::double precision IS NULL THEN NULL ELSE to_timestamp($11::double precision / 1000.0) END,
         resolved_at = CASE WHEN $12::double precision IS NULL THEN NULL ELSE to_timestamp($12::double precision / 1000.0) END,
         first_response_due_at = CASE WHEN $13::double precision IS NULL THEN NULL ELSE to_timestamp($13::double precision / 1000.0) END,
         at_risk_at = CASE WHEN $14::double precision IS NULL THEN NULL ELSE to_timestamp($14::double precision / 1000.0) END,
         resolution_due_at = CASE WHEN $15::double precision IS NULL THEN NULL ELSE to_timestamp($15::double precision / 1000.0) END,
         generation = generation + 1, updated_at = now()
       WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid`,
      [
        tenantId, ticketId, c.mode, loaded.band, c.state,
        c.budgets.firstResponseSec, c.budgets.resolutionSec, c.budgets.l1Sec, c.budgets.l2Sec, c.carriedSec,
        loaded.awaitingStudentSince, loaded.resolvedAt,
        firstResponseDue ?? null, atRisk ?? null, resolutionDue ?? null,
      ],
    );

    await tx.query('DELETE FROM sla.sla_segments WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid', [tenantId, ticketId]);
    for (const [seq, segment] of c.segments.entries()) {
      await tx.query(
        `INSERT INTO sla.sla_segments (tenant_id, ticket_id, seq, start_at, end_at)
         VALUES ($1::uuid, $2::uuid, $3, to_timestamp($4::double precision / 1000.0),
                 CASE WHEN $5::double precision IS NULL THEN NULL ELSE to_timestamp($5::double precision / 1000.0) END)`,
        [tenantId, ticketId, seq, segment.start, segment.end ?? null],
      );
    }

    await tx.query('SELECT sla.set_ticket_sla($1::uuid, CASE WHEN $2::double precision IS NULL THEN NULL ELSE to_timestamp($2::double precision / 1000.0) END, false)', [
      ticketId,
      resolutionDue ?? null,
    ]);

    const rows = deriveTimers(
      {
        triageStartedAt: null,
        resolvedAt: loaded.resolvedAt,
        awaitingStudentSince: loaded.awaitingStudentSince,
        l3EscalatedAt: loaded.l3EscalatedAt,
      },
      c,
      calendar,
    );
    const wanted = new Set<TimerKind>();
    for (const row of rows) {
      wanted.add(row.kind);
      await upsertTimer(tx, { tenantId, ticketId, kind: row.kind }, row.dueAt);
    }
    for (const kind of SLA_TIMER_KINDS) {
      if (!wanted.has(kind)) await cancelTimer(tx, { tenantId, ticketId, kind });
    }
  }
}
