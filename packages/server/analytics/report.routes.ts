// Framework-neutral route table for report schedules. The HTTP layer authenticates and builds the actor, and maps
// ReportValidationError to 422 VALIDATION_FAILED with `{ fields }`, ReportPermissionError to 403
// INSUFFICIENT_PERMISSION and ReportScheduleNotFoundError to 403 ACCESS_DENIED.

import { ErrorCode, httpStatusOf } from '@campusconnect/contracts';
import type { ReportScheduleService } from './report-schedule.service';
import {
  ReportPermissionError,
  ReportScheduleNotFoundError,
  ReportValidationError,
  type ReportActor,
} from './report.types';

export interface ReportRouteRequest {
  readonly actor: ReportActor;
  readonly params: Readonly<Record<string, string>>;
  readonly body: unknown;
}

export interface ReportRoute {
  readonly method: 'GET' | 'POST' | 'DELETE';
  readonly path: string;
  readonly handler: (request: ReportRouteRequest) => Promise<unknown>;
}

export function reportRoutes(service: ReportScheduleService): readonly ReportRoute[] {
  return [
    { method: 'POST', path: '/reports/schedules', handler: (r) => service.create(r.actor, r.body) },
    { method: 'GET', path: '/reports/schedules', handler: (r) => service.list(r.actor) },
    { method: 'DELETE', path: '/reports/schedules/:id', handler: (r) => service.remove(r.actor, r.params['id'] ?? '') },
  ];
}

export interface ReportErrorMapping {
  readonly code: typeof ErrorCode.VALIDATION_FAILED | typeof ErrorCode.INSUFFICIENT_PERMISSION | typeof ErrorCode.ACCESS_DENIED;
  readonly status: number;
  readonly fields?: ReportValidationError['fields'];
}

export function toReportProblem(error: unknown): ReportErrorMapping | undefined {
  if (error instanceof ReportValidationError) {
    return { code: ErrorCode.VALIDATION_FAILED, status: httpStatusOf(ErrorCode.VALIDATION_FAILED), fields: error.fields };
  }
  if (error instanceof ReportPermissionError) {
    return { code: ErrorCode.INSUFFICIENT_PERMISSION, status: httpStatusOf(ErrorCode.INSUFFICIENT_PERMISSION) };
  }
  if (error instanceof ReportScheduleNotFoundError) {
    return { code: ErrorCode.ACCESS_DENIED, status: httpStatusOf(ErrorCode.ACCESS_DENIED) };
  }
  return undefined;
}
