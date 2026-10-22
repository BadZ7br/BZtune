import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(new URL('../doomvault/package.json', import.meta.url));
const ts = require('typescript');
function load(mock, globals = {}) {
  const exports = {};
  const source = readFileSync(new URL('../doomvault/src/services/lyrics.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(compiled, { exports, TextEncoder, URLSearchParams, AbortSignal, DOMException, require: () => ({ apiFetch: mock }), ...globals });
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
    assert.equal(options.signal.aborted, false);
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

test('manual delay shifts highlighting without changing media time or the source LRC', () => {
  const {parseLrc,activeLyricLine}=load();
  const text='[00:01.00]First\n[00:02.00]Second';
  const lines=parseLrc(text),before=JSON.stringify(lines);
  assert.equal(activeLyricLine(lines,.95,0),-1);
  assert.equal(activeLyricLine(lines,.95,-100),0);
  assert.equal(activeLyricLine(lines,1.05,100),-1);
  assert.equal(activeLyricLine(lines,1.1,100),0);
  assert.equal(activeLyricLine(lines,1.95,-100),1);
  assert.equal(JSON.stringify(lines),before);
});
test('manual delay composes with the offset embedded in an imported file', () => {
  const {parseLrc,activeLyricLine}=load();
  const lines=parseLrc('[offset:500]\n[00:01.00]First');
  assert.equal(activeLyricLine(lines,.5),0);
  assert.equal(activeLyricLine(lines,.5,200),-1);
  assert.equal(activeLyricLine(lines,.7,200),0);
  assert.equal(activeLyricLine(lines,.3,-200),0);
});

test('literal bracketed lyrics remain intact; metadata never becomes sung text',()=>{
  const {parseLrc}=load();
  const text='[ar:Artist]\n[ti:Song]\n[al:Album]\n[by:Editor]\n[00:01.00][refrão] Hello [echo]\n[00:02.00]Eu disse [00:30] e [offset:500]\n[00:03.00]Final [sem fechar';
  assert.deepEqual(JSON.parse(JSON.stringify(parseLrc(text))),[
    {time:1,text:'[refrão] Hello [echo]'},
    {time:2,text:'Eu disse [00:30] e [offset:500]'},
    {time:3,text:'Final [sem fechar'},
  ]);
});
test('simultaneous original and translation form one active block, retaining their order',()=>{
  const {parseLrc,activeLyricLine}=load();
  const lines=parseLrc('[00:02]Next\n[00:01.0]Original\n[00:01.000]Tradução [refrão]');
  assert.equal(lines.length,2);
  assert.equal(lines[0].text,'Original\nTradução [refrão]');
  assert.equal(lines[activeLyricLine(lines,1)].text,'Original\nTradução [refrão]');
  assert.equal(activeLyricLine(lines,1.05,100),-1);
  assert.equal(lines[activeLyricLine(lines,1.1,100)].text,'Original\nTradução [refrão]');
  assert.equal(lines[activeLyricLine(lines,2.1,100)].text,'Next');
});
test('multiple leading timestamps, offsets and legacy newlines preserve simultaneous blocks',()=>{
  const {parseLrc}=load();
  const lines=parseLrc('\uFEFF[offset:-250]\r[00:01][00:01.000] [00:03]Hello [echo]\r[00:03.00]Olá');
  assert.deepEqual(JSON.parse(JSON.stringify(lines)),[
    {time:1.25,text:'Hello [echo]'},
    {time:3.25,text:'Hello [echo]\nOlá'},
  ]);
  assert.equal(parseLrc('[offset:'+'9'.repeat(400)+']\n[00:01]Hello')[0].time,1);
});


test('version search encodes metadata, forwards cancellation and ranks by duration', async () => {
  const controller = new AbortController();
  const candidate = (id, duration) => ({source:'LRCLIB',instrumental:false,syncedLyrics:'[00:01]Text',plainLyrics:'',id,duration,trackName:'Song',artistName:'A & B',albumName:'Album'});
  const {searchLyricsVersions} = load(async (url, options) => {
    const parsed = new URL(url);
    assert.equal(parsed.pathname, '/api/lyrics/search');
    assert.equal(parsed.searchParams.get('artist_name'), 'A & B');
    assert.equal(parsed.searchParams.has('duration'), false);
    assert.equal(options.signal.aborted, false);
    return {ok:true,json:async()=>({candidates:[candidate(1,300),candidate(2,123),candidate(3,130)]})};
  });
  assert.deepEqual(Array.from(await searchLyricsVersions({title:'Song',artist:'A & B'},124,controller.signal),r=>r.id),[2,3,1]);
  assert.deepEqual(Array.from(await searchLyricsVersions({title:'Song',artist:'A & B'},0,controller.signal),r=>r.id),[1,2,3]);
});
test('version search rejects malformed lists and reports provider errors', async () => {
  for (const payload of [{}, {candidates:[{id:1}]}, {candidates:Array(101).fill({})}]) {
    await assert.rejects(load(async()=>({ok:true,json:async()=>payload})).searchLyricsVersions({title:'Song',artist:'Artist'},0,new AbortController().signal),/inválida/);
  }
  await assert.rejects(load(async()=>({ok:false,json:async()=>({error:'Unavailable'})})).searchLyricsVersions({title:'Song',artist:'Artist'},0,new AbortController().signal),/Unavailable/);
});

test('verse seek reverses the manual delay once, composing with parsed LRC offsets', () => {
  const {parseLrc,lyricSeekPosition,activeLyricLine}=load();
  const lines=parseLrc('[offset:500]\n[00:03.000]Original\n[00:03.000]Tradução');
  assert.equal(lines.length,1);
  assert.equal(lyricSeekPosition(lines[0],100,10),2.6);
  assert.equal(lyricSeekPosition(lines[0],-100,10),2.4);
  for(const delay of [-100,0,100])assert.equal(activeLyricLine(lines,lyricSeekPosition(lines[0],delay,10),delay),0);
  assert.equal(lyricSeekPosition({time:.1,text:'Intro'},-200,10),0);
  assert.equal(lyricSeekPosition({time:10,text:'End'},0,10),10);
  for(const [time,delay,duration] of [[20,0,10],[10,100,10],[NaN,0,10],[-1,0,10],[1,Infinity,10],[1,1,10],[1,0,0],[1,0,Infinity]]) {
    assert.equal(lyricSeekPosition({time,text:'Invalid'},delay,duration),null);
  }
});

test('seeking millisecond timestamps highlights that verse despite floating point noise',()=>{
  const {lyricSeekPosition,activeLyricLine}=load();
  for(let ms=1;ms<2000;ms++)for(const delay of [-100,0,100]){
    const line={time:ms/1000,text:'Verse'};
    const target=lyricSeekPosition(line,delay,10);
    assert.equal(activeLyricLine([line],target,delay),0);
    if(target>0)assert.equal(activeLyricLine([line],target-.000001,delay),-1);
  }
});

test('automatic fallback matches remaster spelling and duration without selecting live or other artists',async()=>{
  const row=(id,extra={})=>({source:'LRCLIB',instrumental:false,syncedLyrics:'',plainLyrics:'Words',id,trackName:'Black Sabbath (2009 - Remaster)',artistName:'Black Sabbath',albumName:'Compilation',duration:381,...extra});
  const track={title:'Black Sabbath',artist:'Black Sabbath',album:'Black Sabbath'};
  const {matchingLyricsVersion}=load();
  assert.equal(matchingLyricsVersion(track,381,[row(1,{albumName:'Live at London'}),row(2,{artistName:'Cover Band'}),row(3,{duration:400}),row(4)]).id,4);
  assert.equal(matchingLyricsVersion(track,0,[row(4)]),null);
  assert.equal(matchingLyricsVersion(track,381,[row(1,{trackName:'Black Sabbath (Live)'})]),null);
  assert.equal(matchingLyricsVersion(track,381,[row(1,{instrumental:true})]),null);
  assert.equal(matchingLyricsVersion({...track,title:'Black Sabbath - 2009 Remaster'},381,[row(4)]).id,4);
});
test('failed exact lookup automatically uses versions and reads late recording metadata',async()=>{
  let calls=0,duration=0;
  const candidate={source:'LRCLIB',instrumental:false,syncedLyrics:'',plainLyrics:'Words',id:1,trackName:'Song',artistName:'Artist',albumName:'',duration:123};
  const {resolveLyrics}=load(async(url,options)=>{
    calls++;
    if(new URL(url).pathname==='/api/lyrics')return {ok:false,status:502,json:async()=>({error:'Unavailable'})};
    duration=123;assert.equal(options.signal.aborted,false);
    return {ok:true,json:async()=>({candidates:[candidate]})};
  });
  const outcome=await resolveLyrics({title:'Song',artist:'Artist'},()=>duration,new AbortController().signal);
  assert.equal(outcome.result.id,1);assert.equal(calls,2);
});
test('fallback offers uncertain versions without automatically replacing lyrics',async()=>{
  const candidate={source:'LRCLIB',instrumental:false,syncedLyrics:'',plainLyrics:'Words',id:1,trackName:'Song (Live)',artistName:'Artist',albumName:'Live',duration:123};
  const {resolveLyrics}=load(async(url)=>new URL(url).pathname==='/api/lyrics'?{ok:false,status:404,json:async()=>({error:'Not found'})}:{ok:true,json:async()=>({candidates:[candidate]})});
  const outcome=await resolveLyrics({title:'Song',artist:'Artist'},123,new AbortController().signal);
  assert.equal(outcome.result,undefined);assert.equal(outcome.candidates[0].id,1);
});
test('cancellation and invalid metadata never start a fallback search',async()=>{
  for(const status of [400,409,429,503,502]){
    const controller=new AbortController();let calls=0;
    const {resolveLyrics}=load(async()=>{calls++;if(status===502)controller.abort();return {ok:false,status,json:async()=>({error:'Stopped'})}});
    await assert.rejects(resolveLyrics({title:'Song',artist:'Artist'},123,controller.signal));
    assert.equal(calls,1);
  }
});


test('unknown durations remain manual candidates, sort last and never match automatically', async () => {
  const row = (id, duration) => ({source:'LRCLIB',instrumental:false,syncedLyrics:'',plainLyrics:'Words',id,duration,trackName:'Song',artistName:'Artist',albumName:''});
  const rows = [row(1,null),row(2,125),row(3,123),row(4,null)];
  const {searchLyricsVersions,matchingLyricsVersion,isLyricsCandidate} = load(async()=>({ok:true,json:async()=>({candidates:rows})}));
  assert.equal(isLyricsCandidate(rows[0]),true);
  for (const duration of [undefined,NaN,Infinity,-1,true,'123']) assert.equal(isLyricsCandidate(row(5,duration)),false);
  const signal = new AbortController().signal;
  assert.deepEqual(Array.from(await searchLyricsVersions({title:'Song',artist:'Artist'},123,signal),r=>r.id),[3,2,1,4]);
  assert.deepEqual(Array.from(await searchLyricsVersions({title:'Song',artist:'Artist'},0,signal),r=>r.id),[2,3,1,4]);
  assert.equal(matchingLyricsVersion({title:'Song',artist:'Artist'},123,[rows[0]]),null);
  assert.equal(matchingLyricsVersion({title:'Song',artist:'Artist'},1,[rows[0],row(5,0)]),null);
  assert.equal(matchingLyricsVersion({title:'Song',artist:'Artist'},123,rows).id,3);
});
test('fallback with only unknown durations offers manual selection without inventing duration', async () => {
  const candidate = {source:'LRCLIB',instrumental:false,syncedLyrics:'',plainLyrics:'Words',id:1,duration:null,trackName:'Song',artistName:'Artist',albumName:''};
  const {resolveLyrics} = load(async url => new URL(url).pathname === '/api/lyrics'
    ? {ok:false,status:404,json:async()=>({error:'Not found'})}
    : {ok:true,json:async()=>({candidates:[candidate]})});
  const outcome = await resolveLyrics({title:'Song',artist:'Artist'},123,new AbortController().signal);
  assert.equal(outcome.result,undefined);
  assert.equal(outcome.candidates[0].duration,null);
});

test('recording markers distinguish song names from title annotations and album versions', () => {
  const {matchingLyricsVersion} = load();
  const track = {title:'Live Forever',artist:'Oasis',album:'Definitely Maybe'};
  const candidate = (extra={}) => ({source:'LRCLIB',instrumental:false,syncedLyrics:'[00:01]Words',plainLyrics:'',id:1,duration:274,trackName:track.title,artistName:track.artist,albumName:track.album,...extra});
  assert.equal(matchingLyricsVersion(track,274,[candidate({albumName:'Live at Wembley'})]),null);
  assert.equal(matchingLyricsVersion(track,274,[candidate({albumName:'Compilation'})]).id,1);
  assert.equal(matchingLyricsVersion(track,274,[candidate({trackName:'Live Forever (2009 - Remaster)'})]).id,1);
  for (const albumName of ['Ao Vivo','Acústico MTV','Versão Acústica','Unplugged','Demo Sessions','Remix','Karaokê','Instrumental']) {
    assert.equal(matchingLyricsVersion(track,274,[candidate({albumName})]),null,albumName);
    assert.equal(matchingLyricsVersion({...track,album:albumName},274,[candidate()]),null,albumName);
  }
  const liveTrack = {...track,title:'Live Forever (Live)',album:'Live at Wembley'};
  // A title annotation cannot hide a conflicting album version, even with equal duration.
  assert.equal(matchingLyricsVersion({...liveTrack,album:'Definitely Maybe'},274,[candidate({trackName:liveTrack.title,albumName:liveTrack.album})]),null);
  assert.equal(matchingLyricsVersion(liveTrack,274,[candidate({trackName:liveTrack.title,albumName:liveTrack.album})]).id,1);
  for (const album of ['Ao Vivo','Acústico MTV']) {
    assert.equal(matchingLyricsVersion({title:'Canção',artist:'Artista',album:'Estúdio'},274,[candidate({trackName:'Canção',artistName:'Artista',albumName:album})]),null);
  }
  // Version words inside the actual song name do not imply an instrumental recording.
  assert.equal(matchingLyricsVersion({...track,title:'Instrumental Love'},274,[candidate({trackName:'Instrumental Love',instrumental:true})]),null);
});

test('conflicting studio/live fallback offers versions instead of silently saving a result', async () => {
  for (const [title,albumName] of [['Live Forever','Live at Wembley'],['Canção','Ao Vivo']]) {
    const candidate = {source:'LRCLIB',instrumental:false,syncedLyrics:'',plainLyrics:'Words',id:1,duration:274,trackName:title,artistName:'Artist',albumName};
    const {resolveLyrics} = load(async url => new URL(url).pathname === '/api/lyrics'
      ? {ok:false,status:404,json:async()=>({error:'Not found'})}
      : {ok:true,json:async()=>({candidates:[candidate]})});
    const outcome = await resolveLyrics({title,artist:'Artist',album:'Studio'},274,new AbortController().signal);
    assert.equal(outcome.result,undefined);
    assert.equal(outcome.candidates[0].id,1);
  }
});

test('stored lyrics require usable text or an explicit instrumental result', () => {
  const {isLyricsResult,isUsableLyricsResult} = load();
  const row = {source:'LRCLIB',instrumental:false,syncedLyrics:'',plainLyrics:''};
  assert.equal(isLyricsResult(row),true); // API shape validation remains independent of cache usability.
  for(const extra of [{},{plainLyrics:' \n\t'},{syncedLyrics:'[ar:Artist]\n[ti:Song]'},{syncedLyrics:'[00:99]Invalid'},{syncedLyrics:'[00:01] \n[00:02]'}]) {
    assert.equal(isUsableLyricsResult({...row,...extra}),false);
  }
  for(const extra of [{plainLyrics:'Words'},{syncedLyrics:'[00:01]Words'},{instrumental:true},{plainLyrics:'Words',syncedLyrics:'not LRC'}]) {
    assert.equal(isUsableLyricsResult({...row,...extra}),true);
  }
  for(const value of [null,{}, {...row,plainLyrics:42}, {...row,instrumental:'true'}, {...row,plainLyrics:'x'.repeat(250001)}])assert.equal(isUsableLyricsResult(value),false);
});


test('429 blocks fallback and both search endpoints across tracks until the requested wait expires', async () => {
  let now=100000,calls=0,limited=true;
  class Clock extends Date { static now(){return now} }
  const row={source:'LRCLIB',instrumental:false,syncedLyrics:'',plainLyrics:'Words'};
  const service=load(async()=>{calls++;return limited
    ? {ok:false,status:429,json:async()=>({retry_after_seconds:120})}
    : {ok:true,json:async()=>row};},{Date:Clock});
  const signal=new AbortController().signal;
  await assert.rejects(service.resolveLyrics({title:'First',artist:'Artist'},123,signal),e=>e.status===429&&e.retryAfterSeconds===120);
  assert.equal(calls,1);
  now+=1000;
  for (const operation of [()=>service.resolveLyrics({title:'Second',artist:'Artist'},123,signal),()=>service.searchLyricsVersions({title:'Second',artist:'Artist'},123,signal)]) {
    await assert.rejects(operation(),e=>e.status===429&&e.retryAfterSeconds===119);
  }
  assert.equal(calls,1);
  now+=119000;limited=false;
  assert.equal((await service.resolveLyrics({title:'First',artist:'Artist'},123,signal)).result.plainLyrics,'Words');
  assert.equal(calls,2);
});

test('version-search 429 also blocks exact lookup; malformed errors still preserve rate limiting',async()=>{
  for(const [body,header,expected] of [[{retry_after_seconds:5},null,5],[{},'120',120],[{},null,60],[{retry_after_seconds:-1},null,60],[{retry_after_seconds:'120'},null,60],[{retry_after_seconds:0},null,0],[null,null,60]]){
    let calls=0;
    const service=load(async()=>{calls++;return {ok:false,status:429,headers:{get:()=>header},json:async()=>{if(body===null)throw Error('Invalid JSON');return body}}});
    const signal=new AbortController().signal;
    await assert.rejects(service.searchLyricsVersions({title:'Song',artist:'Artist'},123,signal),e=>e.status===429&&e.retryAfterSeconds===expected);
    if(expected>0){
      await assert.rejects(service.fetchLyrics({title:'Other',artist:'Artist'},123,signal),e=>e.status===429);
      assert.equal(calls,1);
    }
  }
});

test('exact lookup and fallback share one total budget instead of two independent deadlines',async()=>{
  let now=100000,calls=0;
  class Clock extends Date { static now(){return now} }
  const service=load(async(url,options,timeout)=>{
    calls++;
    const params=new URL(url).searchParams;
    assert.match(params.get('request_id'),/^[a-zA-Z0-9-]{16,64}$/);
    if(calls===1){assert.equal(timeout,20000);assert.equal(params.get('timeout_ms'),'15000');now+=19000;return {ok:false,status:404,json:async()=>({error:'Not found'})};}
    assert.equal(timeout,1000);assert.equal(params.get('timeout_ms'),'1000');
    return {ok:true,json:async()=>({candidates:[]})};
  },{Date:Clock});
  await assert.rejects(service.resolveLyrics({title:'Song',artist:'Artist'},123,new AbortController().signal),/Nenhuma letra/);
  assert.equal(calls,2);
});

test('an exhausted total budget never starts a fallback',async()=>{
  let now=100000,calls=0;
  class Clock extends Date { static now(){return now} }
  const service=load(async()=>{calls++;now+=21000;return {ok:false,status:404,json:async()=>({error:'Not found'})};},{Date:Clock});
  await assert.rejects(service.resolveLyrics({title:'Song',artist:'Artist'},123,new AbortController().signal),e=>e.name==='TimeoutError');
  assert.equal(calls,1);
});

test('caller cancellation during response body notifies the backend once and suppresses fallback',async()=>{
  const controller=new AbortController(),cancels=[];
  let url,resolveBodyStarted;
  const bodyStarted=new Promise(resolve=>resolveBodyStarted=resolve);
  const service=load(async(input,options)=>{
    url=new URL(input);
    return {ok:true,json:()=>new Promise((resolve,reject)=>{
      resolveBodyStarted();options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true});
    })};
  },{fetch:async(input,options)=>{cancels.push({input,options});return {ok:true}}});
  const result=service.resolveLyrics({title:'Song',artist:'Artist'},123,controller.signal);
  await bodyStarted;controller.abort();
  await assert.rejects(result,e=>e.name==='AbortError');
  assert.equal(cancels.length,1);
  assert.equal(cancels[0].input,'http://127.0.0.1:5000/api/lyrics/cancel/'+url.searchParams.get('request_id'));
  assert.equal(cancels[0].options.method,'POST');assert.equal(cancels[0].options.keepalive,true);
  assert.equal(cancels[0].options.signal.aborted,false);
});

test('a request deadline cancels the backend even without a user abort',async()=>{
  const cancels=[];const keepAlive=setTimeout(()=>{},500);
  const service=load(async(input,options)=>new Promise((resolve,reject)=>{
    options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true});
  }),{fetch:async url=>{cancels.push(url);return {ok:true}}});
  try{
    await assert.rejects(service.fetchLyrics({title:'Song',artist:'Artist'},123,new AbortController().signal,Date.now()+40),e=>e.name==='TimeoutError');
    assert.equal(cancels.length,1);
  }finally{clearTimeout(keepAlive)}
});
