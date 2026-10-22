import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(new URL('../doomvault/package.json', import.meta.url));
const ts = require('typescript');
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../doomvault/src/services/response-contracts.ts',import.meta.url),'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}
}).outputText, {exports,Error});
const { contracts, readResponse } = exports;
const album={id:'album',title:'Album',artist:'Artist',cover:null,year:'2024'};
const local={id:'local',title:'Local',artist:'Artist',audioUrl:'/audio/local',coverUrl:null,album:null,albumId:null,year:null,trackNumber:null,sourceIds:[]};
const playlist={id:'p',name:'Playlist',description:'',created_at:'2026-01-01',count:2,coverUrl:null,tracks:[
 {id:'one',title:'Web',artist:'Artist',videoId:'abcdefghijk',source:'web',album:null,cover:null},
 {id:'two',title:'Local',artist:'Artist',videoId:'library:local',source:'local',trackId:'local',audioUrl:'/audio/local'}
]};
const examples={
 album:{title:'Album',year:null,description:null,tracks:[{title:'Song',video_id:null,duration:null,duration_seconds:null,artists:[]}]},
 releases:{results:[album]},artists:{results:[{name:'Artist',id:null,image:null,subscribers:null}]},
 discography:{albums:[album],sections:{albums:1},warnings:[],complete:true,verified_id:false},
 tracks:{tracks:[local]},localAlbums:{albums:[{...album,count:1,coverUrl:'/cover/album',hasCover:false}]},
 playlists:{playlists:[playlist]},playlist:{playlist},genres:{genres:['Doom Metal']},genre:{id:'g',name:'Doom Metal'},genreArtists:{artists:[{id:'a',name:'Artist'}],count:1},
 discovery:{songs:[{videoId:'abcdefghijk',title:'Song',artist:'Artist',cover:null,duration:null}],albums:[album],artists:[],seedArtists:['Artist']},
 summary:{totals:{seconds:0,plays:0,tracks:0,artists:0},artists:[],tracks:[{id:'s',title:'Song',artist:'Artist',seconds:30}],albums:[],daily:[],history:[],thresholdSeconds:30},
 wrapped:{year:2026,month:null,seconds:0,plays:0,uniqueArtists:0,topArtists:[],months:[]},
 diagnosis:{python:'3.12',platform:'Windows',sqliteOK:true,tracks:0,libraryPath:'Library',packages:{httpx:true},ffmpeg:{ffmpeg:null,ffprobe:'ffprobe'},freeBytes:10000}
};
test('all area contracts accept backend shapes including nullable provider metadata',()=>{
 assert.deepEqual(Object.keys(contracts).sort(),Object.keys(examples).sort());
 for(const [name,value] of Object.entries(examples)){
  const before=JSON.stringify(value);
  assert.equal(readResponse(value,contracts[name],name),value, name);
  assert.equal(JSON.stringify(value),before,'validation must not rewrite '+name);
 }
});
test('every area rejects missing or invalid envelopes',()=>{
 for(const [name,check]of Object.entries(contracts))for(const value of [null,[],1,'response'])assert.throws(()=>readResponse(value,check,name),/Resposta inválida/,name);
 for(const name of ['album','tracks','playlists','summary'])assert.throws(()=>readResponse({},contracts[name],name),/Resposta inválida/);
});
test('the four F01 failures and malformed nested members never enter state',()=>{
 const invalid=[['album',{title:'Album',tracks:null}],['tracks',{tracks:null}],['playlists',{playlists:null}],['summary',{}],
 ['album',{title:'Album',tracks:[{title:{text:'Song'}}]}],['tracks',{tracks:[{...local,album:{}}]}],
 ['tracks',{tracks:[{...local,coverUrl:{}}]}],['tracks',{tracks:[{...local,sourceIds:[null]}]}],
 ['localAlbums',{albums:[{...album,count:'1',coverUrl:'/cover',hasCover:false}]}],
 ['playlists',{playlists:[{...playlist,tracks:[null]}]}],['playlists',{playlists:[{...playlist,tracks:[{...playlist.tracks[0],source:'unknown'}]}]}],
 ['summary',{...examples.summary,totals:{...examples.summary.totals,seconds:NaN}}],
 ['summary',{...examples.summary,daily:[{day:'2026-01-01',seconds:-1}]}],
 ['wrapped',{...examples.wrapped,topArtists:[{name:{},seconds:0}]}],
 ['releases',{results:[{...album,year:{}}]}],['discovery',{songs:{}}],['genres',{genres:[{}]}],
 ['diagnosis',{...examples.diagnosis,packages:{httpx:'yes'}}]];
 for(const [name,value]of invalid)assert.throws(()=>readResponse(value,contracts[name],name),/Resposta inválida/,name);
});
test('valid empty collections remain legitimate empty states',()=>{
 for(const [name,key]of [['album','tracks'],['tracks','tracks'],['localAlbums','albums'],['playlists','playlists'],['releases','results'],['artists','results'],['discography','albums'],['genres','genres']]){
  const value={...examples[name],[key]:[]};assert.equal(contracts[name](value),true,name);
 }
});
