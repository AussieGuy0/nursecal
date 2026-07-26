const TIMEOUT_MS = 10_000;

export interface ApiFetchOptions {
  /**
   * Extra attempts after the first. Only set this for idempotent requests —
   * retrying a POST/PUT/DELETE risks applying the write twice.
   */
  retries?: number;
  /** Delay before the first retry. Doubles for each subsequent attempt. */
  retryDelayMs?: number;
  /**
   * Per-attempt deadline, or one deadline per attempt. Escalating them suits a
   * retried request: a short first attempt spots a request that was lost and
   * will never answer, while the longer later attempts stay patient enough for
   * a network that is merely slow. The last entry covers any further attempts.
   */
  timeoutMs?: number | number[];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * fetch() with an overall request deadline.
 *
 * The deadline must cover the *whole* request, including reading the response
 * body. A plain `fetch()` promise resolves as soon as the response headers
 * arrive — the body is streamed afterwards. If we disarmed the timeout at that
 * point, a caller doing `await res.json()` could hang forever when the body
 * stream stalls, leaving the app stuck on the "Loading..." screen.
 *
 * So the abort timer stays armed until the body is consumed. We clear it when
 * the fetch rejects, or when a body reader (`json()`/`text()`) settles. For
 * callers that never read the body the timer fires at the deadline and aborts
 * an already-completed response, which is a harmless no-op.
 */
async function fetchOnce(url: string, options: RequestInit | undefined, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

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

/**
 * fetch() with a deadline and, optionally, retries.
 *
 * Retries exist because a request can be lost outright rather than merely be
 * slow: a fetch issued while the service worker is activating and claiming the
 * page can be dropped and never reach the network, so no amount of waiting will
 * produce a response. Observed in production as an app that sits on "Loading..."
 * while the server log shows the request never arrived. Asking again recovers.
 */
export async function apiFetch(
  url: string,
  options?: RequestInit,
  { retries = 0, retryDelayMs = 400, timeoutMs = TIMEOUT_MS }: ApiFetchOptions = {},
): Promise<Response> {
  const deadlines = Array.isArray(timeoutMs) ? timeoutMs : [timeoutMs];
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await sleep(retryDelayMs * 2 ** (attempt - 1));
    }
    try {
      return await fetchOnce(url, options, deadlines[Math.min(attempt, deadlines.length - 1)]);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError;
}
