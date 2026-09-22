import * as Sentry from '@sentry/react';

type Fields = Record<string, string | number | boolean | null>;
interface Entry {
  at: string;
  elapsedMs: number;
  event: string;
  data: Fields;
}
interface Recording {
  id: string;
  build: string;
  startedAt: string;
  events: Entry[];
}
const KEY = 'nursecal-diagnostics-v1';
const MAX_EVENTS = 180;
const boot: Recording = {
  id: crypto.randomUUID(),
  build: __BUILD_ID__,
  startedAt: new Date().toISOString(),
  events: [],
};
let previous: Recording[] = [];
let initialized = false;
let reports = 0;

export const bootId = boot.id;

export function recordDiagnostic(event: string, data: Fields = {}): void {
  // Diagnostics must never change the success/failure of the operation being observed.
  try {
    boot.events.push({ at: new Date().toISOString(), elapsedMs: Math.round(performance.now()), event, data });
    boot.events = boot.events.slice(-MAX_EVENTS);
    localStorage.setItem(KEY, JSON.stringify([...previous, boot]));
  } catch {
    /* Storage may be disabled or full; the in-memory timeline still works. */
  }
}

export function diagnosticReport(): string {
  return JSON.stringify({ version: 1, recordings: [...previous, boot] }, null, 2);
}

export function reportLoadingProblem(reason: string): void {
  recordDiagnostic('loading.problem', { reason });
  // Cap automatic reports per page, including repeated foreground checks.
  if (reports++ >= 3) return;
  try {
    Sentry.captureMessage('NurseCal loading diagnostic', {
      level: 'warning',
      tags: { bootId, build: boot.build, reason },
      contexts: { loading: { timeline: diagnosticReport() } },
    });
  } catch {
    /* Local export remains available if Sentry is unavailable. */
  }
}

export function initializeDiagnostics(): void {
  if (initialized) return;
  initialized = true;
  try {
    const saved = localStorage.getItem(KEY);
    // Read only our bounded, versioned record, not other app storage.
    if (saved && saved.length < 200_000) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed))
        previous = parsed.filter((r) => r && typeof r.id === 'string' && Array.isArray(r.events)).slice(-2);
    }
  } catch {
    /* Continue with a fresh timeline. */
  }
  const state = () => ({
    visibility: document.visibilityState,
    online: navigator.onLine,
    controlled: Boolean(navigator.serviceWorker?.controller),
  });
  recordDiagnostic('boot', {
    ...state(),
    standalone: matchMedia('(display-mode: standalone)').matches,
    userAgent: navigator.userAgent.slice(0, 250),
  });
  document.addEventListener('visibilitychange', () => recordDiagnostic('visibility', state()));
  for (const event of ['online', 'offline', 'pagehide', 'pageshow'] as const) {
    window.addEventListener(event, (e) =>
      recordDiagnostic(event, { ...state(), persisted: 'persisted' in e && Boolean(e.persisted) }),
    );
  }
  // Do not record exception messages or URLs, which may contain user data.
  window.addEventListener('error', () => recordDiagnostic('window.error'));
  window.addEventListener('unhandledrejection', () => recordDiagnostic('window.unhandledrejection'));
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () =>
      recordDiagnostic('sw.controllerchange', state()),
    );
    navigator.serviceWorker
      .getRegistration()
      .then((registration) => {
        recordDiagnostic('sw.registration', {
          found: Boolean(registration),
          active: registration?.active?.state ?? null,
          waiting: registration?.waiting?.state ?? null,
        });
        const watch = (worker: ServiceWorker | null) => {
          if (!worker) return;
          recordDiagnostic('sw.state', { state: worker.state });
          worker.addEventListener('statechange', () => recordDiagnostic('sw.state', { state: worker.state }));
        };
        if (registration) {
          watch(registration.installing);
          registration.addEventListener('updatefound', () => {
            recordDiagnostic('sw.updatefound');
            watch(registration.installing);
          });
        }
      })
      .catch(() => recordDiagnostic('sw.registration.error'));
  }
  // Wall-clock gaps expose suspension/timer throttling; they do not prove a JS hang.
  let lastTick = Date.now();
  setInterval(() => {
    const gapMs = Date.now() - lastTick;
    lastTick = Date.now();
    if (gapMs > 10_000) recordDiagnostic('timer.gap', { gapMs, ...state() });
  }, 5_000);
}
