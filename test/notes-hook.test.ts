import { test, expect } from 'bun:test';
import { join } from 'path';

test('note autosave regression cases run with isolated module mocks', () => {
  const result = Bun.spawnSync([process.execPath, 'test', join(import.meta.dir, 'fixtures/notes-hook.cases.ts')]);
  expect(result.exitCode, result.stdout.toString() + result.stderr.toString()).toBe(0);
});
