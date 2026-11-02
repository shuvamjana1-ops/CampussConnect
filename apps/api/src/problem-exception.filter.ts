import { randomUUID } from 'node:crypto';
import { Catch, HttpException, Inject, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import {
  PROBLEM_JSON_MEDIA_TYPE,
  problem,
  type ErrorCode,
  type FieldError,
  type ProblemDetails,
} from '@campusconnect/contracts';
import type { Logger } from '@campusconnect/observability';
import { AuditUnavailableError } from '@campusconnect/server/audit';
import { ApiError } from './api-error';
import { LOGGER } from './tokens';
import type { AppClsStore } from './request-context';

/** The parts of the HTTP response the filter uses. Keeps the filter independent of the HTTP platform. */
interface HttpResponse {
  status(code: number): HttpResponse;
  setHeader(name: string, value: string): unknown;
  type(mediaType: string): HttpResponse;
  send(body: string): unknown;
}

/** Body for an unexpected failure. It has no catalogue code, so it carries no detail at all. */
interface InternalProblem {
  readonly type: 'about:blank';
  readonly title: 'Internal error';
  readonly status: 500;
  readonly requestId: string;
}

const DEFAULT_RETRY_AFTER_SECONDS = 60;

/**
 * Turns every thrown error into an RFC 9457 `application/problem+json` response. The body is built only from a
 * catalogue code, field paths and fixed extension members. Exception messages and stacks are never copied into
 * it, so user text and PII cannot reach the client (19.6).
 */
@Catch()
export class ProblemExceptionFilter implements ExceptionFilter {
  constructor(
    @Inject(ClsService) private readonly cls: ClsService<AppClsStore>,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponse>();
    const requestId = this.cls.getId() ?? randomUUID();
    const body = this.toProblem(exception, requestId);

    if (body.status === 500) {
      this.logger.error('http.unhandled_error', { requestId, status: 500 });
    } else {
      this.logger.warn('http.error', { requestId, status: body.status, ...('code' in body ? { errorCode: body.code } : {}) });
    }
    if ('code' in body && body.code === 'RATE_LIMITED') {
      response.setHeader('Retry-After', String(body.retryAfterSeconds));
    }
    response.status(body.status).type(PROBLEM_JSON_MEDIA_TYPE).send(JSON.stringify(body));
  }

  private toProblem(exception: unknown, requestId: string): ProblemDetails | InternalProblem {
    if (exception instanceof ApiError) {
      // `extensions` was typed against `code` by the ApiError constructor.
      return problem(exception.code, { requestId, ...exception.extensions } as never) as ProblemDetails;
    }
    if (exception instanceof AuditUnavailableError) {
      return problem('AUDIT_UNAVAILABLE', { requestId });
    }
    if (exception instanceof HttpException) {
      return this.fromHttpStatus(exception.getStatus(), requestId);
    }
    return { type: 'about:blank', title: 'Internal error', status: 500, requestId };
  }

  /** Maps framework errors (routing, body parsing, rate limiting) onto the catalogue. */
  private fromHttpStatus(status: number, requestId: string): ProblemDetails | InternalProblem {
    const code = HTTP_STATUS_CODES[status];
    if (code === undefined) {
      return status >= 400 && status < 500
        ? problem('VALIDATION_FAILED', { requestId, fields: [MALFORMED_REQUEST] })
        : { type: 'about:blank', title: 'Internal error', status: 500, requestId };
    }
    switch (code) {
      case 'VALIDATION_FAILED':
        return problem(code, { requestId, fields: [MALFORMED_REQUEST] });
      case 'RATE_LIMITED':
        return problem(code, { requestId, retryAfterSeconds: DEFAULT_RETRY_AFTER_SECONDS });
      default:
        // The remaining codes in the table above have no extension members.
        return problem(code, { requestId } as never) as ProblemDetails;
    }
  }
}

const MALFORMED_REQUEST: FieldError = { path: '', rule: 'invalid' };

/** Framework HTTP statuses and the catalogue code each one reports. Not-found and forbidden look the same (1.4, 8.7). */
const HTTP_STATUS_CODES: Readonly<Record<number, ErrorCode>> = {
  400: 'VALIDATION_FAILED',
  401: 'AUTHENTICATION_REQUIRED',
  403: 'ACCESS_DENIED',
  404: 'ACCESS_DENIED',
  413: 'VALIDATION_FAILED',
  415: 'VALIDATION_FAILED',
  422: 'VALIDATION_FAILED',
  429: 'RATE_LIMITED',
};
