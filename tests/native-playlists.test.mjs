import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(new URL("../doomvault/package.json", import.meta.url));
const ts = require("typescript");
function load({ invoke, fetch, timers = {} } = {}) {
  function module(name) {
    const exports = {};
    const compiled = ts.transpileModule(readFileSync(new URL(`../doomvault/src/services/${name}.ts`, import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    vm.runInNewContext(compiled, { exports, Error, AbortController, setTimeout, clearTimeout, ...timers,
      window: invoke ? { __TAURI__: { core: { invoke } } } : {},
      fetch: fetch ?? (() => { throw Error("Unexpected HTTP request"); }),
      require: name => name.includes("music-utils") ? { API: "http://127.0.0.1:5000" } : module(name.replace("./", "")),
    });
    return exports;
  }
  return module("playlists");
}

test("desktop playlist reads and mutations use IPC without any HTTP request", async () => {
  const seen = [];
  const { playlists } = load({ invoke: async (command, args) => { seen.push([command, args.request]); return args.request.action === "list" ? { playlists: [] } : { playlist: { id: "p" } }; } });
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
  const { playlists } = load({ fetch: async (url, init) => { calls.push([url, init]); return { ok: true, json: async () => ({playlists: []}) }; } });
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

test("browser playlist reads forward cancellation and reject without waiting for fetch", async () => {
  const controller = new AbortController();
  let received;
  const { playlists } = load({ fetch: (_url, init) => {
    received = init.signal; return new Promise(() => {});
  } });
  const reading = playlists.list(controller.signal);
  controller.abort();
  await assert.rejects(reading, error => error.status === 499 && !error.uncertain);
  assert.equal(received.aborted, true);
});

function clock() {
 const jobs = new Map(); let next = 0;
 return {timers:{setTimeout:fn=>{const id=++next;jobs.set(id,fn);return id},clearTimeout:id=>jobs.delete(id)},
 expire(){for(const fn of [...jobs.values()])fn()},get size(){return jobs.size}};
}
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};

test("native timeout releases the caller, never retries a write, and requires settled IPC plus fresh state", async () => {
 const time=clock(),late=deferred();let writes=0,reads=0;
 const {playlists}=load({timers:time.timers,invoke:(_command,{request})=>{
  if(request.action==='list'){reads++;return Promise.resolve({playlists:[]})}
  writes++;return late.promise;
 }});
 const pending=playlists.create('Slow');time.expire();
 await assert.rejects(pending,e=>e.status===408&&e.uncertain);
 assert.equal(time.size,0);
 await playlists.list(); // A read while the IPC remains pending must not unblock writes.
 await assert.rejects(playlists.create('Duplicate'),e=>e.uncertain);
 assert.equal(writes,1);assert.equal(reads,1);
 late.resolve({playlist:{id:'new'}});await new Promise(resolve=>setImmediate(resolve));
 await assert.rejects(playlists.remove('new'),e=>e.uncertain);
 await playlists.list();assert.equal(playlists.pendingMessage(),'');
 await playlists.create('Reviewed');assert.equal(writes,2);assert.equal(time.size,0);
});

test("HTTP timeout covers stalled JSON bodies, aborts transport and requires a validated read before any new write", async () => {
 const time=clock(),late=deferred();let calls=0,signal;let valid=false;
 const {playlists}=load({timers:time.timers,fetch:async(_url,init)=>{
  calls++;signal=init.signal;
  return {ok:true,json:()=>init.method==='GET'?Promise.resolve(valid?{playlists:[]}:{playlists:null}):late.promise};
 }});
 const pending=playlists.create('Slow');await Promise.resolve();time.expire();
 await assert.rejects(pending,e=>e.status===408&&e.uncertain);assert.equal(signal.aborted,true);
 await assert.rejects(playlists.create('Duplicate'),e=>e.uncertain);assert.equal(calls,1);
 late.resolve({playlist:{id:'done'}});await new Promise(resolve=>setImmediate(resolve));
 await assert.rejects(playlists.list(),/Resposta inválida/);
 await assert.rejects(playlists.remove('done'),e=>e.uncertain);assert.equal(calls,2);
 valid=true;await playlists.list();assert.equal(playlists.pendingMessage(),'');assert.equal(time.size,0);
});

test("a native read that started before a late write settled cannot reconcile it", async()=>{
 const time=clock(),write=deferred(),read=deferred();
 const {playlists}=load({timers:time.timers,invoke:(_command,{request})=>request.action==='list'?read.promise:write.promise});
 const mutation=playlists.create('Slow');time.expire();await assert.rejects(mutation);
 const reading=playlists.list();write.reject({status:500,error:'Late failure'});
 await new Promise(resolve=>setImmediate(resolve));read.resolve({playlists:[]});await reading;
 await assert.rejects(playlists.create('Retry'),e=>e.uncertain);
 await playlists.list();assert.equal(playlists.pendingMessage(),'');
});

test("read timeouts do not poison later writes and successful calls clean up deadlines", async()=>{
 const time=clock();
 const {playlists}=load({timers:time.timers,invoke:(_command,{request})=>request.action==='list'?new Promise(()=>{}):Promise.resolve({playlist:{id:'p'}})});
 const reading=playlists.list();time.expire();await assert.rejects(reading,e=>e.status===408&&!e.uncertain);
 await playlists.create('Healthy');assert.equal(time.size,0);assert.equal(playlists.pendingMessage(),'');
});

test("native read cancellation works even when the bridge ignores AbortSignal", async()=>{
 const time=clock(),late=deferred(),controller=new AbortController();
 const {playlists}=load({timers:time.timers,invoke:()=>late.promise});
 const pending=playlists.list(controller.signal);controller.abort();
 await assert.rejects(pending,e=>e.status===499&&!e.uncertain);
 late.reject(Error('Late rejection after cancellation'));
 await new Promise(resolve=>setImmediate(resolve));assert.equal(time.size,0);
});

test("cover uploads preserve FormData and share the uncertain-write lock", async()=>{
 const time=clock(),late=deferred(),form={file:'cover'},calls=[];
 const {playlistHttp,playlists}=load({timers:time.timers,fetch:(url,init)=>{
  calls.push({url,init});return late.promise;
 }});
 const pending=playlistHttp('/api/playlists/p/cover',{method:'POST',body:form});time.expire();
 await assert.rejects(pending,e=>e.status===408&&e.uncertain);
 assert.equal(calls[0].init.body,form);assert.equal(calls[0].init.headers,undefined);
 await assert.rejects(playlists.remove('p'),e=>e.uncertain);
 await assert.rejects(playlistHttp('/api/playlists/p/cover',{method:'DELETE'}),e=>e.uncertain);
 assert.equal(calls.length,1);
 late.reject(Error('aborted'));await new Promise(resolve=>setImmediate(resolve));assert.equal(time.size,0);
});
