import { test, expect, mock, afterEach } from 'bun:test';

// Exercise the real autosave hook with a minimal hook runner and controlled API responses.
let states: any[],
  refs: any[],
  effects: (() => void | (() => void))[],
  cleanups: (() => void)[] = [];
let stateIndex: number, refIndex: number;
mock.module('../../node_modules/react/index.js', () => ({
  useState(value: unknown) {
    const i = stateIndex++;
    if (!(i in states)) states[i] = value;
    return [
      states[i],
      (next: any) => {
        states[i] = typeof next === 'function' ? next(states[i]) : next;
      },
    ];
  },
  useRef(value: unknown) {
    return (refs[refIndex++] ??= { current: value });
  },
  useCallback(fn: unknown) {
    return fn;
  },
  useEffect(fn: () => void) {
    effects.push(fn);
  },
}));
let requests: {
  body: { note: string; version: number };
  resolve: (response: any) => void;
  reject: (error: Error) => void;
}[];
mock.module('../../src/utils/api', () => ({
  apiFetch: (_url: string, options?: RequestInit) =>
    options
      ? new Promise((resolve, reject) => requests.push({ body: JSON.parse(options.body as string), resolve, reject }))
      : Promise.resolve({ ok: true, json: async () => ({ notes: {}, versions: {} }) }),
}));
const { useNotes } = await import('../../src/hooks/useNotes');
const settle = () => Bun.sleep(0);
function respond(i: number, status: number, note: string, version: number) {
  requests[i].resolve({ ok: status === 200, status, json: async () => ({ note, version }) });
}
async function setup() {
  states = [];
  refs = [];
  effects = [];
  requests = [];
  stateIndex = refIndex = 0;
  const hook = useNotes(true);
  effects.forEach((fn) => {
    const cleanup = fn();
    if (cleanup) cleanups.push(cleanup);
  });
  await settle();
  return hook;
}
afterEach(() => {
  cleanups.forEach((fn) => fn());
  cleanups = [];
});

test('serializes newer drafts using the version returned by the preceding save', async () => {
  const hook = await setup();
  hook.saveNote('2025-04-10', 'old');
  hook.retryNote('2025-04-10');
  hook.saveNote('2025-04-10', 'new');
  hook.retryNote('2025-04-10');
  expect(requests.length).toBe(1);
  respond(0, 200, 'old', 1);
  await settle();
  expect(requests[1].body).toEqual({ note: 'new', version: 1 });
  respond(1, 200, 'new', 2);
  await settle();
  expect(states[0]['2025-04-10']).toBe('new');
  expect(states[2]['2025-04-10']).toBe('saved');
});

test('keeps conflicted drafts and requires explicit retry with the current server version', async () => {
  const hook = await setup();
  hook.saveNote('2025-04-10', 'my draft');
  hook.retryNote('2025-04-10');
  respond(0, 409, 'other device', 4);
  await settle();
  expect(states[0]['2025-04-10']).toBe('my draft');
  expect(states[2]['2025-04-10']).toBe('conflict');
  expect(requests.length).toBe(1);
  hook.saveNote('2025-04-10', 'edited draft');
  expect(states[2]['2025-04-10']).toBe('conflict');
  hook.retryNote('2025-04-10');
  expect(requests[1].body).toEqual({ note: 'edited draft', version: 4 });
  respond(1, 200, 'edited draft', 5);
  await settle();
  expect(states[2]['2025-04-10']).toBe('saved');
});

test('keeps failed drafts available for retry', async () => {
  const hook = await setup();
  hook.saveNote('2025-04-10', 'keep me');
  hook.retryNote('2025-04-10');
  requests[0].reject(new Error('offline'));
  await settle();
  expect(states[0]['2025-04-10']).toBe('keep me');
  expect(states[2]['2025-04-10']).toBe('error');
  hook.retryNote('2025-04-10');
  respond(1, 200, 'keep me', 1);
  await settle();
  expect(states[2]['2025-04-10']).toBe('saved');
});
