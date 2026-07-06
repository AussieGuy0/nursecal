const TIMEOUT_MS = 10_000;

/**
 * fetch() wrapper with an overall request deadline.
 *
 * The deadline must cover the *whole* request, including reading the response
 * body. A plain `fetch()` promise resolves as soon as the response headers
 * arrive — the body is streamed afterwards. If we disarmed the timeout at that
 * point, a caller doing `await res.json()` could hang forever when the body
 * stream stalls (common on mobile network transitions), which is exactly what
 * left the app stuck on the "Loading..." screen during the auth check.
 *
 * So the abort timer stays armed until the body is consumed. We clear it when
 * the fetch rejects, or when a body reader (`json()`/`text()`) settles. For
 * callers that never read the body the timer fires at the deadline and aborts
 * an already-completed response, which is a harmless no-op.
 */
export async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }

  const clear = () => clearTimeout(timeoutId);
  const guard = <T>(read: () => Promise<T>): Promise<T> => read().finally(clear);

  const originalJson = res.json.bind(res);
  const originalText = res.text.bind(res);
  res.json = () => guard(originalJson);
  res.text = () => guard(originalText);

  return res;
}
