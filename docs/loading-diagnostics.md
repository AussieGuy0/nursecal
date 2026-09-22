# Investigating a loading incident

This instrumentation collects evidence; it does not change the existing auth retries,
timeouts, watchdog, or service-worker update policy.

## Capture an incident

1. When loading sticks, tap **Download diagnostics** before tapping reload. The button
   is on both loading screens, the login screen, and in Settings after recovery.
2. Keep the JSON file and note the approximate time. If you already reloaded, download
   immediately afterwards: the current page and two previous page recordings survive
   in local storage. Cache-clearing recovery does not delete this storage.
3. Match the file's `requestId` with server logs (`fly logs -a nursecal`). The `bootId`
   groups requests from one page; `serverInstanceId` distinguishes server processes.
   Save the relevant logs promptly; retention is controlled by the hosting platform.

Each page includes a build timestamp, UTC timestamps, elapsed time, browser version,
visibility, online hint, standalone mode and service-worker control/state transitions.
Each API attempt records start, headers, body start/completion/error, and deadline/error.
UI events identify whether auth, labels, shifts, or a shared calendar were blocking the
screen. `auth.watchdog.fired` means the existing timer ran, not necessarily that it changed
state; inspect the adjacent `ui.phase` events. `request.deadline` after headers with no
body-read event can simply be an intentionally unread response, such as logout.

## Interpret the evidence

| Timeline                                                          | What it tells us                                                                                                                                         |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser `request.start`, no matching server `request.received`    | No observed arrival at the app. Investigate browser/SW, connectivity, proxy and server availability; this alone does **not** prove a service-worker bug. |
| Server `request.received`, no `request.completed`                 | The app accepted the request but has not recorded completion. Investigate parsing/auth/handler work, process termination, or missing logs.               |
| Server completion, no browser `request.headers`                   | The server finished its response lifecycle; investigate delivery/proxy/browser/SW. Completion does not prove delivery to the device.                     |
| Browser headers, then body start without body end (or body error) | Response-body transfer/reading is the stalled or failed stage.                                                                                           |
| Body completes but loading remains                                | Investigate application state and the other pending requests shown in `ui.phase`.                                                                        |
| Long `timer.gap` around visibility changes                        | Evidence of suspension/throttling/event-loop delay, not proof of any one cause.                                                                          |
| `recovery.start` without `recovery.reload`                        | Recovery itself stalled; intermediate events show whether worker cleanup or cache cleanup finished.                                                      |

Fly is currently configured with `min_machines_running = 0` and auto-stop enabled.
Cold starts are another possibility to correlate with `server.starting` and
`server.listening`, not a diagnosis. Server receipt logging now runs before parsing
and auth; the previous completion-only logs could not establish whether an unfinished
request ever arrived.

## Automatic reports

After eight seconds on either loading screen, emit a warning named
`NurseCal loading diagnostic` to the existing Sentry integration. Tags include `bootId`,
`build`, and `reason`; the `loading` context contains the timeline. At most three warnings
are attempted per page. Export again after recovery to capture the events after that
snapshot. This requires **VITE_SENTRY_DSN at frontend build time**; setting only runtime
`SENTRY_DSN` configures the backend, not the browser. Docker accepts `--build-arg
VITE_SENTRY_DSN=...` (or Fly's corresponding build argument). No deployment secrets or
live reporting settings are changed by this patch.

Downloads work without Sentry or network access. Reports can fail to upload during the
same outage being investigated; the local recording is the fallback.

## Scope and limits

- Only the last 180 events per page and three pages are retained. Multiple tabs can
  overwrite the persisted history; the active tab keeps its own in-memory recording.
- No cookies, auth tokens, emails, query strings, request/response bodies, or shift data
  are deliberately included in the new timeline/server request records. Route parameters
  are replaced with placeholders. Existing Sentry exception collection is unchanged.
- Private mode, blocked/full storage, clearing site data or reinstalling the PWA may
  prevent persistence. In-memory export still works if the page is responsive.
- Instrumentation starts when the JavaScript entrypoint runs. A bundle that never loads,
  an old cached build, or a completely frozen browser cannot emit new events or export.
  Absence of events is not proof of a server fault. Timers also cannot run while suspended.
- The browser's online flag is only a hint. Request IDs are correlation values, not
  authentication or proof that a client is trusted.
- No new ingestion endpoint, analytics dependency, or fix to the loading behavior is added.
