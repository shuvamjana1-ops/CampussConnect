import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import type { Logger } from '@campusconnect/observability';
import type { TenantId } from '@campusconnect/domain/types';
import { readSessionCookie } from '@campusconnect/server/identity';
import { ApiError } from '../api-error';
import type { AppClsStore } from '../request-context';
import {
  GUARD_AUDITOR,
  HOST_TENANT_RESOLVER,
  LOGGER,
  PRINCIPAL_DIRECTORY,
  SESSION_READER,
} from '../tokens';
import type {
  AuthRejectionReason,
  GuardAuditor,
  GuardRequest,
  HostTenantResolver,
  PrincipalDirectory,
  SessionReader,
} from './guard-ports';
import { IS_PUBLIC } from './public.decorator';

/** The request host without a port, lower-cased. */
export function requestHost(req: GuardRequest): string | undefined {
  const raw = req.hostname ?? (typeof req.headers['host'] === 'string' ? req.headers['host'] : undefined);
  if (raw === undefined) return undefined;
  const host = raw.replace(/:\d+$/, '').toLowerCase();
  return host.length > 0 ? host : undefined;
}

/**
 * Rejects every request without a valid session before any data access (1.3, 2.7), checks that the session's
 * Tenant is the Tenant of the request host (1.2), and fills the request context that `withTenant` needs.
 * The Tenant always comes from the session. The host is only cross-checked.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ClsService) private readonly cls: ClsService<AppClsStore>,
    @Inject(SESSION_READER) private readonly sessions: SessionReader,
    @Inject(HOST_TENANT_RESOLVER) private readonly hosts: HostTenantResolver,
    @Inject(PRINCIPAL_DIRECTORY) private readonly principals: PrincipalDirectory,
    @Inject(GUARD_AUDITOR) private readonly auditor: GuardAuditor,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [context.getHandler(), context.getClass()]) === true) {
      return true;
    }
    const req = context.switchToHttp().getRequest<GuardRequest>();
    const host = requestHost(req);
    const hostTenant = host === undefined ? undefined : await this.hosts.resolve(host);

    const cookie = req.headers['cookie'];
    const sessionId = readSessionCookie(typeof cookie === 'string' ? cookie : undefined);
    if (sessionId === undefined) return this.reject('no_session', hostTenant?.id);

    const session = await this.sessions.getSession(sessionId);
    if (session === undefined) return this.reject('session_invalid', hostTenant?.id);
    if (hostTenant === undefined) return this.reject('tenant_unresolved', session.tenantId);
    if (hostTenant.id !== session.tenantId) return this.reject('tenant_mismatch', session.tenantId);

    const principal = await this.principals.load(session);
    this.cls.set('tenantId', session.tenantId);
    this.cls.set('userId', session.userId);
    this.cls.set('principal', principal);
    this.cls.set('requestContext', {
      tenantId: session.tenantId,
      userId: session.userId,
      roles: [...session.roles],
      departmentIds: [...session.departmentIds],
    });
    return true;
  }

  private async reject(reason: AuthRejectionReason, tenantId: TenantId | undefined): Promise<never> {
    try {
      await this.auditor.authRejected({ ...(tenantId === undefined ? {} : { tenantId }), reason, timestampMs: Date.now() });
    } catch {
      // The request is rejected either way. A failed audit write is reported, not surfaced to the caller.
      this.logger.error('auth.rejected_audit_failed', { reason });
    }
    throw new ApiError('AUTHENTICATION_REQUIRED', {});
  }
}
