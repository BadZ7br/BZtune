import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(new URL("../doomvault/package.json", import.meta.url));
const ts = require("typescript");
const compiled = ts.transpileModule(readFileSync(new URL("../doomvault/src/services/home.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
function load({ fetch = () => { throw Error("Unexpected HTTP"); }, list = () => { throw Error("Unexpected playlist read"); } } = {}) {
  const exports = {};
  vm.runInNewContext(compiled, { exports, Error, fetch,
    require: name => name === "./playlists" ? { playlists: { list } } : { API: "http://127.0.0.1:5000" },
  });
  return exports;
}
const track = { id: "t", title: "Música", artist: "Artista", audioUrl: "/audio", coverUrl: null };
const playlist = { id: "p", name: "Favoritas", count: 2, coverUrl: null };
const signal = new AbortController().signal;
const reply = value => async () => ({ ok: true, json: async () => value });

test("library rejects HTTP failures even with an apparently valid body", async () => {
  const { loadRecentTracks } = load({ fetch: async () => ({ ok: false, status: 503, json: async () => ({ tracks: [track] }) }) });
  await assert.rejects(loadRecentTracks(signal), /HTTP 503/);
});
test("library rejects malformed JSON and network failures", async () => {
  for (const fetch of [async () => { throw Error("Offline"); }, async () => ({ ok: true, json: async () => { throw SyntaxError("JSON"); } })]) {
    await assert.rejects(load({ fetch }).loadRecentTracks(signal));
  }
});
test("invalid track payloads cannot render as an empty library or break playback", async () => {
  for (const value of [null, {}, { tracks: null }, { tracks: {} }, { tracks: [null] }, { tracks: [{ ...track, title: 4 }] }, { tracks: [{ ...track, audioUrl: null }] }, { tracks: [{ ...track, coverUrl: {} }] }]) {
    await assert.rejects(load({ fetch: reply(value) }).loadRecentTracks(signal), /inválida/);
  }
});
test("valid library responses preserve playback fields, limit cards and forward cancellation", async () => {
  let received;
  const { loadRecentTracks } = load({ fetch: async (url, options) => {
    received = { url, signal: options.signal };
    return { ok: true, json: async () => ({ tracks: Array(10).fill(track) }) };
  } });
  const result = await loadRecentTracks(signal);
  assert.equal(result.length, 8);
  assert.equal(JSON.stringify(result[0]), JSON.stringify(track));
  assert.equal(received.signal, signal);
  assert.equal(received.url, "http://127.0.0.1:5000/api/library/tracks");
});
test("successful empty responses stay distinct from failed requests", async () => {
  assert.equal((await load({ fetch: reply({ tracks: [] }) }).loadRecentTracks(signal)).length, 0);
  assert.equal((await load({ list: async () => ({ playlists: [] }) }).loadHomePlaylists(signal)).length, 0);
});
test("home uses the shared playlist service with cancellation and limits cards", async () => {
  let received;
  const { loadHomePlaylists } = load({ list: async value => { received = value; return { playlists: Array(9).fill(playlist) }; } });
  const result = await loadHomePlaylists(signal);
  assert.equal(received, signal);
  assert.equal(result.length, 6);
  assert.equal(JSON.stringify(result[0]), JSON.stringify(playlist));
});
test("invalid playlist summaries and native failures reject instead of masquerading as empty", async () => {
  for (const value of [null, {}, { playlists: null }, { playlists: [null] }, ...[-1, 1.5, "2", NaN].map(count => ({ playlists: [{ ...playlist, count }] })), { playlists: [{ ...playlist, name: {} }] }]) {
    await assert.rejects(load({ list: async () => value }).loadHomePlaylists(signal), /inválida/);
  }
  await assert.rejects(load({ list: async () => { throw Error("Native unavailable"); } }).loadHomePlaylists(signal), /Native unavailable/);
});
