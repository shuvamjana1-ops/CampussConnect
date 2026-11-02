import pino, { type DestinationStream, type Logger as PinoLogger, type LoggerOptions as PinoLoggerOptions } from 'pino';

import { sanitizeLogFields, type LogFields } from './log-fields';
import type { TelemetryContextProvider } from './telemetry-context';
import { isEventName, isServiceName } from './validation';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Written in place of an event name that is not a dotted lower-case identifier. */
export const INVALID_EVENT = 'log.invalid_event';

/**
 * Structured logger whose lines hold only an event name and allowlisted {@link LogFields} (25.1, 19.6).
 *
 * `event` must be a string literal such as `'ticket.created'`. The parameter type turns a plain `string` into
 * `never`, so a dynamic value such as an error message or user input cannot become the log message.
 */
export interface Logger {
  debug<E extends string>(event: string extends E ? never : E, fields?: LogFields): void;
  info<E extends string>(event: string extends E ? never : E, fields?: LogFields): void;
  warn<E extends string>(event: string extends E ? never : E, fields?: LogFields): void;
  error<E extends string>(event: string extends E ? never : E, fields?: LogFields): void;
  /** Returns a logger that adds `bindings` to every line. Fields passed to a log call override bindings. */
  child(bindings: LogFields): Logger;
}

export interface LoggerOptions {
  /** Service name written on every line, such as `api`, `worker` or `emergency-worker`. */
  readonly service: string;
  /** Lowest level written. Defaults to `info`. */
  readonly level?: LogLevel | 'silent';
  /**
   * Supplies `requestId` and `tenantId` for the current request, so every line written during a request carries
   * them (25.1). Bindings and call fields override it.
   */
  readonly getContext?: TelemetryContextProvider;
  /** Where JSON lines are written. Defaults to standard output, which ECS ships to CloudWatch Logs. */
  readonly destination?: DestinationStream;
}

/**
 * Creates the platform logger on pino. Each line is one JSON object with `level`, `time`, `service`, `event`,
 * the allowlisted fields that passed their checks, and, when a call passed anything else, `invalidFields`
 * (names of allowlisted fields with rejected values) and `droppedFieldCount` (fields outside the allowlist).
 */
export function createLogger(options: LoggerOptions): Logger {
  if (!isServiceName(options.service)) {
    throw new RangeError('service must be a lower-case service name such as "api".');
  }
  const pinoOptions: PinoLoggerOptions = {
    level: options.level ?? 'info',
    base: { service: options.service },
    messageKey: 'event',
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label: string) => ({ level: label }) },
  };
  return new AllowlistLogger(pino(pinoOptions, options.destination), {}, options.getContext);
}

class AllowlistLogger implements Logger {
  readonly #pino: PinoLogger;
  readonly #bindings: LogFields;
  readonly #getContext: TelemetryContextProvider | undefined;

  constructor(instance: PinoLogger, bindings: LogFields, getContext: TelemetryContextProvider | undefined) {
    this.#pino = instance;
    this.#bindings = bindings;
    this.#getContext = getContext;
  }

  debug<E extends string>(event: string extends E ? never : E, fields?: LogFields): void {
    this.#write('debug', event, fields);
  }

  info<E extends string>(event: string extends E ? never : E, fields?: LogFields): void {
    this.#write('info', event, fields);
  }

  warn<E extends string>(event: string extends E ? never : E, fields?: LogFields): void {
    this.#write('warn', event, fields);
  }

  error<E extends string>(event: string extends E ? never : E, fields?: LogFields): void {
    this.#write('error', event, fields);
  }

  child(bindings: LogFields): Logger {
    return new AllowlistLogger(this.#pino, { ...this.#bindings, ...bindings }, this.#getContext);
  }

  #write(level: LogLevel, event: string, fields: LogFields | undefined): void {
    if (!this.#pino.isLevelEnabled(level)) {
      return;
    }
    const sanitized = sanitizeLogFields({ ...this.#getContext?.(), ...this.#bindings, ...fields });
    const record: Record<string, unknown> = { ...sanitized.fields };
    if (sanitized.invalidFields.length > 0) {
      record.invalidFields = sanitized.invalidFields;
    }
    if (sanitized.droppedFieldCount > 0) {
      record.droppedFieldCount = sanitized.droppedFieldCount;
    }
    this.#pino[level](record, isEventName(event) ? event : INVALID_EVENT);
  }
}
