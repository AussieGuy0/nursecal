// Only known route shapes enter diagnostics; never include query strings or identifiers.
export function diagnosticPath(url: string): string {
  try {
    const path = new URL(url, 'http://local').pathname;
    if (
      /^\/api\/(auth\/(me|login|logout|register\/(initiate|verify))|labels|calendar|shares|shared-calendars|google\/(auth|callback|status|disconnect|toggle|events))$/.test(
        path,
      )
    )
      return path;
    for (const resource of ['labels', 'shares', 'shared-calendars']) {
      if (path.startsWith(`/api/${resource}/`)) return `/api/${resource}/:id`;
    }
    if (path === '/' || path === '/sw.js') return path;
    if (path.startsWith('/assets/')) return '/assets/:file';
  } catch {
    /* Invalid URLs are not useful diagnostic data. */
  }
  return '/other';
}

export function diagnosticId(value: string | null): string | undefined {
  return value && /^[a-f0-9-]{36}$/.test(value) ? value : undefined;
}
