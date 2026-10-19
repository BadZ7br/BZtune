import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
const require = createRequire(new URL("../doomvault/package.json", import.meta.url));
const ts = require("typescript");
const source = readFileSync(new URL("../doomvault/src/player/queue-utils.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const exports = {};
vm.runInNewContext(compiled, { exports }, { filename: "queue-utils.js" });
const { insertNextQueueItem, moveQueueItem, remapMovedIndex, removeQueueItem } = exports;

const t = (videoId, audioUrl) => ({ videoId, audioUrl, title: videoId, artist: "Teste" });
const a = t("a"), b = t("b"), c = t("c"), d = t("d");

test("fila vazia: enfileira pausado sem índice inválido", () => {
  const result = insertNextQueueItem({ tracks: [], index: -1 }, a);
  assert.equal(result.queue.tracks.length, 1);
  assert.equal(result.queue.index, 0);
  assert.equal(result.insertedAt, 0);
});

test("insere imediatamente depois da música atual", () => {
  const result = insertNextQueueItem({ tracks: [a, b, c], index: 1 }, d);
  assert.deepEqual(result.queue.tracks.map(x => x.videoId), ["a", "b", "d", "c"]);
  assert.equal(result.queue.index, 1);
  assert.equal(result.insertedAt, 2);
});

test("duplicata existente depois da atual é movida, não duplicada", () => {
  const result = insertNextQueueItem({ tracks: [a, b, c, d], index: 0 }, d);
  assert.deepEqual(result.queue.tracks.map(x => x.videoId), ["a", "d", "b", "c"]);
  assert.equal(result.queue.index, 0);
  assert.equal(result.queue.tracks.length, 4);
  assert.deepEqual(result.moved, { from: 3, to: 1 });
});

test("duplicata antes da atual é movida sem interromper a faixa tocando", () => {
  const result = insertNextQueueItem({ tracks: [a, b, c, d], index: 2 }, a);
  assert.deepEqual(result.queue.tracks.map(x => x.videoId), ["b", "c", "a", "d"]);
  assert.equal(result.queue.index, 1);
  assert.equal(result.queue.tracks[result.queue.index].videoId, "c");
  assert.deepEqual(result.moved, { from: 0, to: 2 });
});

test("música atual não é duplicada", () => {
  const initial = { tracks: [a, b, c], index: 1 };
  assert.equal(insertNextQueueItem(initial, b).queue, initial);
});

test("mesmo videoId com outra fonte local pode ter entrada diferente", () => {
  const online = t("same"), local = t("same", "/audio.mp3");
  const result = insertNextQueueItem({ tracks: [online], index: 0 }, local);
  assert.equal(result.queue.tracks.length, 2);
  assert.equal(result.queue.tracks[1].audioUrl, "/audio.mp3");
});

test("reorder e remover atuais não provocam índices incorretos", () => {
  const list = { tracks: [a, b, c], index: 1 };
  const moved = moveQueueItem(list, 2, 0);
  assert.equal(moved.tracks[moved.index].videoId, "b");
  assert.equal(remapMovedIndex(1, 2, 0), 2);
  assert.equal(removeQueueItem(moved, 2).index, 1);
});
