import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import { ApiError } from '../api-error';
import type { AppClsStore } from '../request-context';
import { RATE_LIMIT_CONFIG, SLIDING_WINDOW } from '../tokens';
import type { RateLimitConfigReader, SlidingWindowCounter } from './guard-ports';
import { IS_PUBLIC } from './public.decorator';

/**
 * Sliding-window rate limits per user and per Tenant (22.7). Limits come from `rate_limit_config`, so operators
 * change them without a deployment. Over the limit the call gets `429 RATE_LIMITED` with the seconds until calls
 * are accepted again; the filter turns that into the `Retry-After` header (22.8).
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ClsService) private readonly cls: ClsService<AppClsStore>,
    @Inject(RATE_LIMIT_CONFIG) private readonly config: RateLimitConfigReader,
    @Inject(SLIDING_WINDOW) private readonly windows: SlidingWindowCounter,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [context.getHandler(), context.getClass()]) === true) {
      return true;
    }
    const ctx = this.cls.get('requestContext');
    if (ctx === undefined) throw new ApiError('AUTHENTICATION_REQUIRED', {});

    const settings = await this.config.settings(ctx.tenantId as never);
    const now = Date.now();
    const user = await this.windows.hit(`rl:user:${ctx.tenantId}:${ctx.userId}`, settings.user, now);
    if (!user.allowed) throw rateLimited(user.retryAfterSeconds);
    const tenant = await this.windows.hit(`rl:tenant:${ctx.tenantId}`, settings.tenant, now);
    if (!tenant.allowed) throw rateLimited(tenant.retryAfterSeconds);
    return true;
  }
}

function rateLimited(retryAfterSeconds: number): ApiError<'RATE_LIMITED'> {
  return new ApiError('RATE_LIMITED', { retryAfterSeconds: Math.max(1, Math.ceil(retryAfterSeconds)) });
}
