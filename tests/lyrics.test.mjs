import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(new URL('../doomvault/package.json', import.meta.url));
const ts = require('typescript');
function load(mock) {
  const exports = {};
  const source = readFileSync(new URL('../doomvault/src/services/lyrics.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(compiled, { exports, TextEncoder, URLSearchParams, require: () => ({ apiFetch: mock }) });
  return exports;
}
test('LRC accepts multiple timestamps and offset, rejects invalid seconds', () => {
  const { parseLrc } = load();
  const lines = parseLrc('[offset:500]\n[00:02.5][00:04.050]Hello\n[00:99]bad\n[00:01.00]First');
  assert.deepEqual(JSON.parse(JSON.stringify(lines)), [{ time: .5, text: 'First' }, { time: 2, text: 'Hello' }, { time: 3.55, text: 'Hello' }]);
  assert.equal(parseLrc('not LRC').length, 0);
});
test('lookup sends encoded metadata and cancellation, returns plain lyrics', async () => {
  const controller = new AbortController();
  const { fetchLyrics } = load(async (url, options) => {
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get('artist_name'), 'A & B');
    assert.equal(parsed.searchParams.get('duration'), '123');
    assert.equal(options.signal, controller.signal);
    return { ok: true, json: async () => ({ source: 'LRCLIB', instrumental: false, syncedLyrics: '', plainLyrics: 'Hello' }) };
  });
  assert.equal((await fetchLyrics({ title: 'Song', artist: 'A & B' }, 123, controller.signal)).plainLyrics, 'Hello');
});
test('lookup reports not found and rejects malformed responses', async () => {
  for (const [response, message] of [
    [{ ok: false, json: async () => ({ error: 'Not found' }) }, /Not found/],
    [{ ok: true, json: async () => ({ source: 'LRCLIB', plainLyrics: {} }) }, /inválida/],
  ]) {
    await assert.rejects(load(async () => response).fetchLyrics({ title: 'Song', artist: 'Artist' }, 0, new AbortController().signal), message);
  }
});
