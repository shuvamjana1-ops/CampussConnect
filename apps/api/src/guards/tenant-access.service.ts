import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { Logger } from '@campusconnect/observability';
import type { TenantId, UserId } from '@campusconnect/domain/types';
import { ApiError } from '../api-error';
import type { AppClsStore } from '../request-context';
import { GUARD_AUDITOR, LOGGER, TENANT_OWNERSHIP } from '../tokens';
import type { GuardAuditor, TenantOwnership } from './guard-ports';

/**
 * Cross-tenant detection for resources addressed by id (1.4). Call it before loading the resource. An id that
 * belongs to another Tenant and an id that does not exist produce the same `403 ACCESS_DENIED`, so the response
 * never reveals which one it was. Only the other-Tenant case writes `tenant.cross_access_denied`.
 */
@Injectable()
export class TenantAccessService {
  constructor(
    @Inject(ClsService) private readonly cls: ClsService<AppClsStore>,
    @Inject(TENANT_OWNERSHIP) private readonly ownership: TenantOwnership,
    @Inject(GUARD_AUDITOR) private readonly auditor: GuardAuditor,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async assertSameTenant(resourceType: string, resourceId: string): Promise<void> {
    const ctx = this.cls.get('requestContext');
    if (ctx === undefined) throw new ApiError('AUTHENTICATION_REQUIRED', {});
    const owner = await this.ownership.ownerTenantOf(ctx.tenantId as TenantId, resourceType, resourceId);
    if (owner === ctx.tenantId) return;
    if (owner !== undefined) {
      try {
        await this.auditor.crossTenantDenied({
          requestingTenantId: ctx.tenantId as TenantId,
          targetTenantId: owner as TenantId,
          userId: ctx.userId as UserId,
          resourceType,
          timestampMs: Date.now(),
        });
      } catch {
        // The denial stands. A failed audit write is reported, not surfaced, so the response stays identical.
        this.logger.error('tenant.cross_access_audit_failed', { resourceType });
      }
    }
    throw new ApiError('ACCESS_DENIED', {});
  }
}
