import { recordDiagnostic } from './diagnostics';
/**
 * Last-resort recovery for an app that will not finish loading.
 *
 * A plain `window.location.reload()` is answered by the same service worker and
 * the same caches that got the app stuck, which is why the loading screen's
 * reload button can look like it does nothing. Tearing the worker and its
 * caches down first guarantees the next load starts from the network.
 */
export async function hardReload(): Promise<void> {
  recordDiagnostic('recovery.start');
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }

    recordDiagnostic('recovery.workers-cleared');
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
    recordDiagnostic('recovery.caches-cleared');
  } catch {
    recordDiagnostic('recovery.cleanup-error');
    // Recovery must never be blocked by cleanup failing — reload regardless.
  }

  recordDiagnostic('recovery.reload');
  window.location.reload();
}
