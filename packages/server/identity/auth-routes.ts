// Framework-neutral handlers for `/auth/*`. `apps/api` binds them to HTTP routes.

import { problem, problemTypeUri, PROBLEM_JSON_MEDIA_TYPE, type ErrorCode } from '@campusconnect/contracts';
import { clearSessionCookie, readSessionCookie, sessionCookie } from './session-cookie';
import { IdentityError, type TenantRef } from './identity.types';
import type { IdentityService } from './identity.service';

export interface AuthRequest {
  /** Tenant resolved from the request host before sign-in starts. */
  readonly tenant: TenantRef;
  readonly requestId: string;
  readonly query: Record<string, string>;
  readonly body?: Record<string, unknown>;
  readonly cookieHeader?: string;
  /** Absolute URL of `/auth/callback` on this Tenant's host. */
  readonly callbackUrl: string;
}

export interface AuthResponse {
  readonly status: number;
  readonly headers: Record<string, string | string[]>;
  readonly body?: unknown;
}

export class AuthRoutes {
  constructor(private readonly identity: IdentityService) {}

  /** `GET /auth/login` */
  async login(req: AuthRequest): Promise<AuthResponse> {
    return this.guard(req, async () => {
      const redirectUrl = await this.identity.startLogin(req.tenant, req.callbackUrl);
      return { status: 302, headers: { Location: redirectUrl, 'Cache-Control': 'no-store' } };
    });
  }

  /** `GET /auth/callback` */
  async callback(req: AuthRequest): Promise<AuthResponse> {
    return this.guard(req, async () => {
      const result = await this.identity.handleCallback(req.tenant, req.query);
      if (result.kind === 'mfa_required') {
        return {
          status: 401,
          headers: { 'Cache-Control': 'no-store', 'Content-Type': PROBLEM_JSON_MEDIA_TYPE },
          body: {
            ...problem('MFA_REQUIRED', { requestId: req.requestId }),
            challengeId: result.challengeId,
            ...(result.enrollment === undefined ? {} : { enrollment: result.enrollment }),
          },
        };
      }
      return {
        status: 200,
        headers: {
          'Set-Cookie': sessionCookie(result.session.id, result.session.idleMinutes),
          'Cache-Control': 'no-store',
        },
        body: { firstSignIn: result.firstSignIn, roles: result.session.roles },
      };
    });
  }

  /** `POST /auth/mfa` with `{ challengeId, code }` */
  async mfa(req: AuthRequest): Promise<AuthResponse> {
    return this.guard(req, async () => {
      const challengeId = req.body?.['challengeId'];
      const code = req.body?.['code'];
      if (typeof challengeId !== 'string' || typeof code !== 'string') throw new IdentityError('MFA_FAILED');
      const session = await this.identity.verifyMfa(req.tenant, challengeId, code);
      return {
        status: 200,
        headers: {
          'Set-Cookie': sessionCookie(session.id, session.idleMinutes),
          'Cache-Control': 'no-store',
        },
        body: { roles: session.roles },
      };
    });
  }

  /** `POST /auth/logout` */
  async logout(req: AuthRequest): Promise<AuthResponse> {
    const sessionId = readSessionCookie(req.cookieHeader);
    if (sessionId !== undefined) await this.identity.signOut(sessionId);
    return { status: 204, headers: { 'Set-Cookie': clearSessionCookie(), 'Cache-Control': 'no-store' } };
  }

  private async guard(req: AuthRequest, run: () => Promise<AuthResponse>): Promise<AuthResponse> {
    try {
      return await run();
    } catch (error) {
      if (!(error instanceof IdentityError)) {
        const code = (error as { code?: unknown } | null)?.code;
        if (code === 'AUDIT_UNAVAILABLE') return problemResponse('AUDIT_UNAVAILABLE', req.requestId);
        throw error;
      }
      if (error.code === 'ACCOUNT_LOCKED' && error.unlockAt !== undefined) {
        const body = problem('ACCOUNT_LOCKED', { requestId: req.requestId, unlockAt: error.unlockAt });
        return { status: body.status, headers: problemHeaders(), body };
      }
      return problemResponse(error.code as Exclude<ErrorCode, 'ACCOUNT_LOCKED'>, req.requestId);
    }
  }
}

function problemHeaders(): Record<string, string> {
  return { 'Content-Type': PROBLEM_JSON_MEDIA_TYPE, 'Cache-Control': 'no-store' };
}

function problemResponse(code: ErrorCode, requestId: string): AuthResponse {
  // Only codes without required extensions reach this function.
  const body = problem(code as 'AUTHENTICATION_REQUIRED', { requestId });
  return { status: body.status, headers: problemHeaders(), body: { ...body, type: problemTypeUri(code), code } };
}
