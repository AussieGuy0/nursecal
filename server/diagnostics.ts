import { diagnosticId, diagnosticPath } from '../shared/diagnostics';

export const serverInstanceId = crypto.randomUUID();

export function createRequestDiagnostics() {
  const requests = new WeakMap<Request, { requestId: string; bootId: string | null; started: number; path: string }>();
  const write = (event: string, request: Request, extra: Record<string, unknown> = {}) => {
    const info = requests.get(request);
    if (!info) return;
    const { started, ...fields } = info;
    console.log(
      JSON.stringify({
        event,
        at: new Date().toISOString(),
        serverInstanceId,
        ...fields,
        method: request.method,
        durationMs: Math.round(performance.now() - started),
        ...extra,
      }),
    );
  };
  return {
    start(request: Request): string {
      const requestId = diagnosticId(request.headers.get('X-Request-ID')) ?? crypto.randomUUID();
      requests.set(request, {
        requestId,
        bootId: diagnosticId(request.headers.get('X-Client-Boot-ID')) ?? null,
        started: performance.now(),
        path: diagnosticPath(request.url),
      });
      write('request.received', request);
      return requestId;
    },
    end(request: Request, status: number | string) {
      write('request.completed', request, { status });
    },
    error(request: Request, code: string | number) {
      write('request.error', request, { code });
    },
  };
}
