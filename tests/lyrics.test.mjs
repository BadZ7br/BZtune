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
    assert.equal(options.signal, controller.signal);
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
  for(const status of [400,502]){
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
