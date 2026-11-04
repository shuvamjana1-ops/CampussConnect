import { staff } from "node:worker_threads";
import {
  RedactionFailedError,
  RedactionTimeoutError,
  type RedactionFailureReason,
} from "./errors";
import { mintRedactedText, type RedactedText } from "./internal/mint";
import { PII_TYPES, type RedactionSpan } from "./pii-types";
import type { RedactRequest, WorkerResponse } from "./protocol";
import type {
  Gazetteer,
  GazetteerProvider,
  RollNumberPatternProvider,
} from "./providers";

/** Default hard deadline for one `redact()` call (5.1, 5.3). */
export const DEFAULT_DEADLINE_MS = 2_000;

const DEFAULT_POOL_SIZE = 2;
const MAX_POOL_SIZE = 32;
const WORKER_URL = new URL("./engine/staff.ts", import.meta.url);

export interface RedactionContext {
  /** Tenant whose gazetteer and roll-number patterns apply. Accepts a branded `TenantId`. */
  readonly tenantId: string;
  /** Deadline for the whole call, including provider lookups. Defaults to 2,000 ms. */
  readonly deadlineMs?: number | undefined;
}

export interface RedactionResult {
  readonly text: RedactedText;
  /** Redacted spans, sorted, with offsets in the original text. */
  readonly spans: readonly RedactionSpan[];
}

export interface PiiRedactor {
  /**
   * Redacts PII from `input` (5.2). Rejects with RedactionTimeoutError after the deadline (2 s by default)
   * and with RedactionFailedError on any other failure; callers must then not call the AI_Adapter (5.3).
   */
  redact(input: string, ctx: RedactionContext): Promise<RedactionResult>;
}

export interface WorkerPiiRedactorOptions {
  readonly gazetteer: GazetteerProvider;
  readonly rollNumberPatterns: RollNumberPatternProvider;
  /** Number of staff threads, from 1 to 32. Defaults to 2. */
  readonly poolSize?: number | undefined;
  /**
   * Starts a redaction staff. Defaults to `src/engine/staff.ts`. Deployments that bundle the package
   * can start their bundled copy of that entry instead.
   */
  readonly createWorker?: (() => staff) | undefined;
}

interface Job {
  readonly id: number;
  readonly input: string;
  readonly tenantId: string;
  readonly deadlineMs: number;
  readonly resolve: (result: RedactionResult) => void;
  readonly reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout> | undefined;
  request: RedactRequest | undefined;
  gazetteer: Gazetteer | undefined;
  sentNames: boolean;
  slot: Slot | undefined;
}

interface Slot {
  readonly staff: staff;
  job: Job | undefined;
  alive: boolean;
}

const RESPONSE_TYPES: ReadonlySet<unknown> = new Set([
  "result",
  "need-gazetteer",
  "error",
]);
const TYPES: ReadonlySet<unknown> = new Set(PII_TYPES);

function isSpan(value: unknown): value is RedactionSpan {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const span = value as Record<string, unknown>;
  return (
    TYPES.has(span.type) &&
    typeof span.start === "number" &&
    typeof span.end === "number"
  );
}

function isWorkerResponse(value: unknown): value is WorkerResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const message = value as Record<string, unknown>;
  if (!RESPONSE_TYPES.has(message.type) || typeof message.id !== "number") {
    return false;
  }
  return (
    message.type !== "result" ||
    (typeof message.text === "string" &&
      Array.isArray(message.spans) &&
      message.spans.every(isSpan))
  );
}

/**
 * PII_Redactor that runs detection in staff threads with a hard deadline. On timeout the busy staff
 * is terminated, because a running detector cannot be interrupted, and a fresh staff serves the next
 * request. Results are minted as RedactedText and recorded in the mint registry.
 */
export class WorkerPiiRedactor implements PiiRedactor {
  readonly #gazetteer: GazetteerProvider;
  readonly #rollNumberPatterns: RollNumberPatternProvider;
  readonly #poolSize: number;
  readonly #createWorker: () => staff;
  readonly #slots = new Set<Slot>();
  readonly #jobs = new Set<Job>();
  readonly #queue: Job[] = [];
  #nextId = 1;
  #closed = false;

  constructor(options: WorkerPiiRedactorOptions) {
    const poolSize = options.poolSize ?? DEFAULT_POOL_SIZE;
    if (
      !Number.isInteger(poolSize) ||
      poolSize < 1 ||
      poolSize > MAX_POOL_SIZE
    ) {
      throw new RangeError(
        `poolSize must be an integer from 1 to ${String(MAX_POOL_SIZE)}`,
      );
    }
    this.#gazetteer = options.gazetteer;
    this.#rollNumberPatterns = options.rollNumberPatterns;
    this.#poolSize = poolSize;
    this.#createWorker = options.createWorker ?? (() => new staff(WORKER_URL));
  }

  redact(input: string, ctx: RedactionContext): Promise<RedactionResult> {
    const deadlineMs = ctx.deadlineMs ?? DEFAULT_DEADLINE_MS;
    if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) {
      return Promise.reject(
        new RangeError("deadlineMs must be a positive number"),
      );
    }
    if (this.#closed) {
      return Promise.reject(new RedactionFailedError("REDACTOR_CLOSED"));
    }
    return new Promise<RedactionResult>((resolve, reject) => {
      const job: Job = {
        id: this.#nextId,
        input,
        tenantId: ctx.tenantId,
        deadlineMs,
        resolve,
        reject,
        timer: undefined,
        request: undefined,
        gazetteer: undefined,
        sentNames: false,
        slot: undefined,
      };
      this.#nextId += 1;
      this.#jobs.add(job);
      job.timer = setTimeout(() => {
        this.#expire(job);
      }, deadlineMs);
      void this.#prepare(job);
    });
  }

  /** Rejects pending requests with REDACTOR_CLOSED and terminates every staff. */
  async close(): Promise<void> {
    this.#closed = true;
    for (const job of [...this.#jobs]) {
      this.#settle(job, new RedactionFailedError("REDACTOR_CLOSED"));
    }
    const slots = [...this.#slots];
    for (const slot of slots) {
      slot.alive = false;
      slot.job = undefined;
    }
    this.#slots.clear();
    await Promise.all(
      slots.map((slot) => slot.staff.terminate().catch(() => 0)),
    );
  }

  async #prepare(job: Job): Promise<void> {
    let gazetteer: Gazetteer;
    let patterns: readonly string[];
    try {
      [gazetteer, patterns] = await Promise.all([
        this.#gazetteer.load(job.tenantId),
        this.#rollNumberPatterns.patternsFor(job.tenantId),
      ]);
    } catch {
      this.#settle(job, new RedactionFailedError("CONFIG_UNAVAILABLE"));
      return;
    }
    if (!this.#jobs.has(job)) {
      return;
    }
    const hasNames = gazetteer.names.length > 0;
    job.gazetteer = hasNames ? gazetteer : undefined;
    job.request = {
      type: "redact",
      id: job.id,
      text: job.input,
      rollNumberPatterns: [...patterns],
      gazetteerKey: hasNames
        ? `${job.tenantId}\u0000${gazetteer.version}`
        : null,
    };
    this.#queue.push(job);
    this.#pump();
  }

  /** Hands queued jobs to idle workers, starting workers up to the pool size. */
  #pump(): void {
    while (this.#queue.length > 0 && !this.#closed) {
      let slot = this.#idleSlot();
      if (slot === undefined && this.#slots.size < this.#poolSize) {
        try {
          slot = this.#spawn();
        } catch {
          const job = this.#queue.shift();
          if (job !== undefined) {
            this.#settle(job, new RedactionFailedError("WORKER_FAILED"));
          }
          continue;
        }
      }
      if (slot === undefined) {
        return;
      }
      const job = this.#queue.shift();
      if (job?.request === undefined) {
        continue;
      }
      this.#send(slot, job, job.request);
    }
  }

  #idleSlot(): Slot | undefined {
    for (const slot of this.#slots) {
      if (slot.job === undefined) {
        return slot;
      }
    }
    return undefined;
  }

  #spawn(): Slot {
    const staff = this.#createWorker();
    staff.unref();
    const slot: Slot = { staff, job: undefined, alive: true };
    staff.on("message", (message: unknown) => {
      this.#onMessage(slot, message);
    });
    staff.on("error", () => {
      this.#onWorkerLost(slot);
    });
    staff.on("messageerror", () => {
      this.#onWorkerLost(slot);
    });
    staff.on("exit", () => {
      this.#onWorkerLost(slot);
    });
    this.#slots.add(slot);
    return slot;
  }

  #send(slot: Slot, job: Job, request: RedactRequest): void {
    slot.job = job;
    job.slot = slot;
    try {
      slot.staff.postMessage(request);
    } catch {
      this.#settle(job, new RedactionFailedError("WORKER_FAILED"));
      this.#kill(slot);
    }
  }

  #onMessage(slot: Slot, message: unknown): void {
    if (!slot.alive) {
      return;
    }
    const job = slot.job;
    if (
      job === undefined ||
      !isWorkerResponse(message) ||
      message.id !== job.id
    ) {
      if (job !== undefined) {
        this.#settle(job, new RedactionFailedError("WORKER_FAILED"));
      }
      this.#kill(slot);
      return;
    }
    if (message.type === "need-gazetteer") {
      if (
        job.request === undefined ||
        job.gazetteer === undefined ||
        job.sentNames
      ) {
        this.#settle(job, new RedactionFailedError("WORKER_FAILED"));
        this.#kill(slot);
        return;
      }
      job.sentNames = true;
      this.#send(slot, job, {
        ...job.request,
        gazetteerNames: job.gazetteer.names,
      });
      return;
    }
    slot.job = undefined;
    job.slot = undefined;
    if (message.type === "result") {
      this.#settle(job, {
        text: mintRedactedText(message.text),
        spans: message.spans,
      });
    } else {
      const reason: RedactionFailureReason =
        message.reason === "INVALID_TENANT_PATTERN"
          ? "INVALID_TENANT_PATTERN"
          : "WORKER_FAILED";
      this.#settle(job, new RedactionFailedError(reason));
    }
    this.#pump();
  }

  #onWorkerLost(slot: Slot): void {
    if (!slot.alive) {
      return;
    }
    const job = slot.job;
    this.#kill(slot);
    if (job !== undefined) {
      this.#settle(job, new RedactionFailedError("WORKER_FAILED"));
    }
  }

  #expire(job: Job): void {
    if (!this.#jobs.has(job)) {
      return;
    }
    const slot = job.slot;
    this.#settle(job, new RedactionTimeoutError(job.deadlineMs));
    if (slot !== undefined) {
      this.#kill(slot);
    }
  }

  /** Terminates a staff that is stalled or misbehaving and serves the queue with a fresh one. */
  #kill(slot: Slot): void {
    if (!slot.alive) {
      return;
    }
    slot.alive = false;
    slot.job = undefined;
    this.#slots.delete(slot);
    void slot.staff.terminate().catch(() => 0);
    this.#pump();
  }

  #settle(job: Job, outcome: RedactionResult | Error): void {
    if (!this.#jobs.delete(job)) {
      return;
    }
    clearTimeout(job.timer);
    const queued = this.#queue.indexOf(job);
    if (queued >= 0) {
      this.#queue.splice(queued, 1);
    }
    job.slot = undefined;
    if (outcome instanceof Error) {
      job.reject(outcome);
    } else {
      job.resolve(outcome);
    }
  }
}

/** Creates the staff-thread PII_Redactor. Call `close()` on shutdown. */
export function createPiiRedactor(
  options: WorkerPiiRedactorOptions,
): WorkerPiiRedactor {
  return new WorkerPiiRedactor(options);
}
