import { afterEach, describe, expect, test, spyOn } from 'bun:test';
import { diagnosticId, diagnosticPath } from '../shared/diagnostics';
import { createRequestDiagnostics } from '../server/diagnostics';

Object.assign(globalThis, { __BUILD_ID__: 'test-build' });
const { apiFetch } = await import('../src/utils/api');
const { diagnosticReport, recordDiagnostic, initializeDiagnostics } = await import('../src/utils/diagnostics');
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const events = () =>
  JSON.parse(diagnosticReport()).recordings.at(-1).events as { event: string; data: Record<string, unknown> }[];

describe('loading diagnostics', () => {
  test('redacts identifiers and queries, and rejects untrusted correlation IDs', () => {
    expect(diagnosticPath('/api/shared-calendars/person%40example.com?token=secret')).toBe('/api/shared-calendars/:id');
    expect(diagnosticPath('/api/google/callback?code=secret')).toBe('/api/google/callback');
    expect(diagnosticPath('/unexpected/person@example.com')).toBe('/other');
    expect(diagnosticId('person@example.com')).toBeUndefined();
  });

  test('server logs arrival before completion and shares the request ID without logging sensitive data', () => {
    const log = spyOn(console, 'log').mockImplementation(() => {});
    try {
      const requestId = crypto.randomUUID();
      const request = new Request('http://localhost/api/shared-calendars/person@example.com?token=secret', {
        headers: { 'X-Request-ID': requestId, Cookie: 'auth=secret' },
      });
      const diagnostics = createRequestDiagnostics();
      expect(diagnostics.start(request)).toBe(requestId);
      expect(JSON.parse(log.mock.calls[0][0]).event).toBe('request.received');
      diagnostics.end(request, 503);
      const last = JSON.parse(log.mock.calls[1][0]);
      expect(last.requestId).toBe(requestId);
      expect(last.status).toBe(503);
      expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
      expect(JSON.stringify(log.mock.calls)).not.toContain('person@example.com');
    } finally {
      log.mockRestore();
    }
  });

  test('a lost first request records its timeout then a distinct successful retry', async () => {
    const ids: string[] = [];
    globalThis.fetch = (async (_url, options) => {
      const headers = new Headers(options?.headers);
      const id = headers.get('X-Request-ID')!;
      ids.push(id);
      expect(headers.get('X-Client-Boot-ID')).toBeTruthy();
      if (ids.length === 1)
        return new Promise<Response>((_resolve, reject) => {
          options!.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        });
      return Response.json({ authenticated: true, email: 'private@example.com' }, { headers: { 'X-Request-ID': id } });
    }) as typeof fetch;
    const response = await apiFetch('/api/auth/me', undefined, { retries: 1, retryDelayMs: 1, timeoutMs: 20 });
    expect((await response.json()).authenticated).toBe(true);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
    const first = events()
      .filter((e) => e.data.requestId === ids[0])
      .map((e) => e.event);
    expect(first).toEqual(['request.start', 'request.deadline', 'request.error']);
    const second = events()
      .filter((e) => e.data.requestId === ids[1])
      .map((e) => e.event);
    expect(second).toEqual(['request.start', 'request.headers', 'request.body.start', 'request.body.end']);
    expect(diagnosticReport()).not.toContain('private@example.com');
  });

  test('a stalled body is distinguishable from a request that never returned headers', async () => {
    let id = '';
    globalThis.fetch = (async (_url, options) => {
      id = new Headers(options?.headers).get('X-Request-ID')!;
      const body = new ReadableStream({
        start(controller) {
          options!.signal!.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')));
        },
      });
      return new Response(body);
    }) as typeof fetch;
    const response = await apiFetch('/api/calendar', undefined, { timeoutMs: 20 });
    await expect(response.json()).rejects.toThrow();
    expect(
      events()
        .filter((e) => e.data.requestId === id)
        .map((e) => e.event),
    ).toEqual(['request.start', 'request.headers', 'request.body.start', 'request.deadline', 'request.body.error']);
  });

  test('unavailable storage does not break recording; memory history stays bounded', () => {
    // Bun has no browser localStorage here, exercising the storage failure path.
    for (let i = 0; i < 200; i++) recordDiagnostic('test', { i });
    expect(events()).toHaveLength(180);
    expect(events().at(-1)?.data.i).toBe(199);
  });
});

test('initialization retains two previous pages and persists the current timeline', () => {
  const names = ['localStorage', 'window', 'document', 'navigator', 'matchMedia'] as const;
  const descriptors = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  const storage = new Map<string, string>();
  storage.set(
    'nursecal-diagnostics-v1',
    JSON.stringify([
      { id: 'oldest', events: [] },
      { id: 'previous-1', events: [] },
      { id: 'previous-2', events: [] },
    ]),
  );
  const values = [
    { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value) },
    new EventTarget(),
    Object.assign(new EventTarget(), { visibilityState: 'visible' }),
    { onLine: true, userAgent: 'test' },
    () => ({ matches: false }),
  ];
  const interval = spyOn(globalThis, 'setInterval').mockImplementation((() => 0) as any);
  try {
    names.forEach((name, i) => Object.defineProperty(globalThis, name, { configurable: true, value: values[i] }));
    initializeDiagnostics();
    recordDiagnostic('recovery.reload');
    const stored = JSON.parse(storage.get('nursecal-diagnostics-v1')!);
    expect(stored).toHaveLength(3);
    expect(stored[0].id).toBe('previous-1');
    expect(stored[1].id).toBe('previous-2');
    expect(stored[2].events.at(-1).event).toBe('recovery.reload');
    expect(JSON.parse(diagnosticReport()).recordings).toEqual(stored);
  } finally {
    interval.mockRestore();
    names.forEach((name, i) => {
      const descriptor = descriptors[i];
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
});
