// The `cc_session` cookie: opaque session id, `HttpOnly; Secure; SameSite=Lax`.

export const SESSION_COOKIE_NAME = 'cc_session';

export function sessionCookie(sessionId: string, idleMinutes: number): string {
  return `${SESSION_COOKIE_NAME}=${sessionId}; Path=/; Max-Age=${idleMinutes * 60}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

/** Extracts the session id from a `Cookie` request header. */
export function readSessionCookie(header: string | undefined): string | undefined {
  if (header === undefined) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() === SESSION_COOKIE_NAME) {
      const value = part.slice(index + 1).trim();
      return value.length > 0 ? value : undefined;
    }
  }
  return undefined;
}
