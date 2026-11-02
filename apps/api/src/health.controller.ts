import { Controller, Get, Inject } from '@nestjs/common';
import { z } from 'zod';
import { DependencyHealth, type DependencySnapshot } from '@campusconnect/server/health';
import { ApiRoute } from './openapi/api-route';

const dependencyStateSchema = z.object({
  status: z.enum(['unknown', 'healthy', 'degraded']),
  consecutiveFailures: z.number().int().nonnegative(),
  lastSuccessAt: z.number().int().optional(),
  lastFailureAt: z.number().int().optional(),
});

export const dependencyHealthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  dependencies: z.object({
    ai: dependencyStateSchema,
    erp: dependencyStateSchema,
    sso: dependencyStateSchema,
    sms: dependencyStateSchema,
  }),
});

export interface DependencyHealthResponse {
  readonly status: 'ok' | 'degraded';
  readonly dependencies: DependencySnapshot;
}

/** Outcomes of recent AI, ERP, SSO and SMS calls. Always 200: a degraded dependency is not an API outage (24.5). */
@Controller('health')
export class HealthController {
  constructor(@Inject(DependencyHealth) private readonly health: DependencyHealth) {}

  @Get('dependencies')
  @ApiRoute({
    summary: 'Recent outcomes of calls to external dependencies',
    responses: { 200: dependencyHealthResponseSchema },
  })
  dependencies(): DependencyHealthResponse {
    return {
      status: this.health.degraded().length === 0 ? 'ok' : 'degraded',
      dependencies: this.health.snapshot(),
    };
  }
}
