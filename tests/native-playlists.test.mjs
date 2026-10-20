import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(new URL("../doomvault/package.json", import.meta.url));
const ts = require("typescript");
const compiled = ts.transpileModule(readFileSync(new URL("../doomvault/src/services/playlists.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function load({ invoke, fetch } = {}) {
  const exports = {};
  vm.runInNewContext(compiled, { exports, Error, window: invoke ? { __TAURI__: { core: { invoke } } } : {},
    fetch: fetch ?? (() => { throw Error("Unexpected HTTP request"); }),
    require: () => ({ API: "http://127.0.0.1:5000" }),
  });
  return exports;
}

test("desktop playlist reads and mutations use IPC without any HTTP request", async () => {
  const seen = [];
  const { playlists } = load({ invoke: async (command, args) => { seen.push([command, args.request]); return { playlist: { id: "p" } }; } });
  await playlists.list();
  await playlists.create("Minha seleção", "Descrição");
  await playlists.update("p", { name: "Novo nome" });
  await playlists.addTrack("p", { track_id: "local" });
  await playlists.addTracks("p", [{ video_id: "abcdefghijk" }]);
  await playlists.reorder("p", ["entry"]);
  await playlists.removeEntry("p", "entry");
  await playlists.remove("p");
  assert.ok(seen.every(([command]) => command === "native_playlists"));
  assert.deepEqual(seen.map(([, request]) => request.action), ["list", "create", "update", "add_track", "add_tracks", "reorder", "remove_entry", "delete"]);
  assert.equal(seen[1][1].name, "Minha seleção");
});

test("a native write failure is reported and never retried through HTTP", async () => {
  const { playlists, PlaylistError } = load({ invoke: async () => { throw { error: "Música já está na playlist.", status: 409 }; } });
  await assert.rejects(playlists.addTrack("p", { track_id: "local" }), error =>
    error instanceof PlaylistError && error.status === 409 && error.message === "Música já está na playlist.");
});

test("browser development keeps the existing HTTP payloads and escapes identifiers", async () => {
  const calls = [];
  const { playlists } = load({ fetch: async (url, init) => { calls.push([url, init]); return { ok: true, json: async () => ({}) }; } });
  await playlists.list();
  await playlists.create("Nome", "Texto");
  await playlists.update("p", { description: "Nova" });
  await playlists.addTrack("p", { track_id: "local" });
  await playlists.addTracks("p", [{ video_id: "abcdefghijk" }]);
  await playlists.reorder("p", ["entry"]);
  await playlists.removeEntry("p/q", "a/b");
  await playlists.remove("p");
  assert.equal(calls[0][0], "http://127.0.0.1:5000/api/playlists");
  assert.equal(calls[1][1].method, "POST");
  assert.deepEqual(JSON.parse(calls[1][1].body), { name: "Nome", description: "Texto" });
  assert.deepEqual(JSON.parse(calls[2][1].body), { description: "Nova" });
  assert.equal(calls[3][0].endsWith("/p/tracks"), true);
  assert.equal(calls[4][0].endsWith("/p/tracks/bulk"), true);
  assert.deepEqual(JSON.parse(calls[5][1].body), { entry_ids: ["entry"] });
  assert.equal(calls[6][0], "http://127.0.0.1:5000/api/playlists/p%2Fq/entries/a%2Fb");
  assert.equal(calls[7][1].method, "DELETE");
});

test("HTTP conflict preserves its status and message", async () => {
  const { playlists, PlaylistError } = load({ fetch: async () => ({ ok: false, status: 409, json: async () => ({ error: "Duplicada" }) }) });
  await assert.rejects(playlists.addTrack("p", { track_id: "local" }), error =>
    error instanceof PlaylistError && error.status === 409 && error.message === "Duplicada");
});

test("browser playlist reads forward cancellation to fetch", async () => {
  const signal = new AbortController().signal;
  let received;
  const { playlists } = load({ fetch: async (_url, init) => {
    received = init.signal;
    return { ok: true, json: async () => ({ playlists: [] }) };
  } });
  await playlists.list(signal);
  assert.equal(received, signal);
});
