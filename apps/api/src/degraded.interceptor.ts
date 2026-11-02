import { Inject, Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import { DependencyHealth } from '@campusconnect/server/health';

/**
 * Adds a `degraded` field, the names of the unavailable dependencies, to JSON object responses while any
 * dependency is degraded. The core action has already succeeded; the field tells clients which functions are
 * running on fallbacks (24.5). Healthy responses are left unchanged.
 */
@Injectable()
export class DegradedInterceptor implements NestInterceptor {
  constructor(@Inject(DependencyHealth) private readonly health: DependencyHealth) {}

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((body: unknown) => {
        const degraded = this.health.degraded();
        if (degraded.length === 0 || !isPlainObject(body) || 'degraded' in body) return body;
        return { ...body, degraded };
      }),
    );
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}
