const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/** The OIDC authorization request parameters carried through the login form. */
export interface AuthorizeParams {
  readonly response_type: string;
  readonly client_id: string;
  readonly redirect_uri: string;
  readonly scope: string;
  readonly state: string;
  readonly nonce: string;
}

const HIDDEN_FIELDS = ['response_type', 'client_id', 'redirect_uri', 'scope', 'state', 'nonce'] as const;

/** Login form that posts the credentials and the authorization request back to the authorize endpoint. */
export function renderLoginPage(tenantSlug: string, params: AuthorizeParams): string {
  const hidden = HIDDEN_FIELDS.map(
    (name) => `<input type="hidden" name="${name}" value="${escapeHtml(params[name])}">`,
  ).join('\n      ');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Sign in: ${escapeHtml(tenantSlug)}</title>
    <style>
      body { font-family: system-ui, sans-serif; max-width: 24rem; margin: 3rem auto; padding: 0 1rem; }
      label, input, button { display: block; width: 100%; font-size: 1rem; }
      input { margin: 0.25rem 0 1rem; padding: 0.5rem; box-sizing: border-box; }
      button { padding: 0.6rem; }
    </style>
  </head>
  <body>
    <main>
      <h1>Sign in to ${escapeHtml(tenantSlug)}</h1>
      <p>Mock institutional sign-in for CampusConnect.</p>
      <form method="post" autocomplete="on">
      ${hidden}
        <label for="username">Username</label>
        <input id="username" name="username" autocomplete="username" required maxlength="255">
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required maxlength="1024">
        <button type="submit">Sign in</button>
      </form>
    </main>
  </body>
</html>
`;
}

/** A plain error page for requests that must not be redirected (unknown client or redirect URI). */
export function renderErrorPage(message: string): string {
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Sign-in error</title></head>
  <body><main><h1>Sign-in error</h1><p>${escapeHtml(message)}</p></main></body>
</html>
`;
}
