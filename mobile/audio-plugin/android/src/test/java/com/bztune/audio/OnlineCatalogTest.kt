package com.bztune.audio

import org.json.JSONObject
import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.nio.file.Files
import java.util.concurrent.CancellationException

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[24],manifest=Config.NONE)
class OnlineCatalogTest {
 private val artist="00000000-0000-0000-0000-000000000001"
 private val group="00000000-0000-0000-0000-000000000002"
 private val release="00000000-0000-0000-0000-000000000003"
 private fun credit()=JSONArray().put(JSONObject().put("name","Ação 日本語").put("artist",JSONObject().put("name","Ação 日本語")).put("joinphrase",""))
 private fun search()=JSONObject().put("count",1).put("artists",JSONArray().put(JSONObject().put("id",artist).put("name","Ação 日本語").put("disambiguation","Brasil")))
 private fun withCache(test:(CatalogCache,java.io.File)->Unit){val dir=Files.createTempDirectory("bztune-catalog-test").toFile();try{test(CatalogCache(dir),dir)}finally{dir.deleteRecursively()}}
 @Test fun buildsFixedProviderPathsAndTreatsSearchAsAnEncodedLiteral() {
  val path=CatalogRequest("search","Ação 日本語 \" OR artist:*","artists",page=2).path()
  assertTrue(path.startsWith("/artist/?query="));assertTrue(path.contains("offset=50"));assertFalse(path.contains("日本語"));assertFalse(path.contains("artist:*"))
  assertEquals("/release/$release?inc=recordings+artist-credits&fmt=json",CatalogRequest("release",id=release).path())
  for(r in listOf(CatalogRequest("search","x"),CatalogRequest("search","valid",kind="arbitrary"),CatalogRequest("artist",id="../file"),CatalogRequest("release",id=release,page=400),CatalogRequest("unknown")))assertThrows(CatalogProblem::class.java){r.path()}
 }
 @Test fun parsesArtistsAndPreservesUnicodeAndPaging() {
  val value=CatalogJson.parse(CatalogRequest("search","Ação"),search());assertEquals("Ação 日本語",value.getJSONArray("items").getJSONObject(0).getString("title"));assertEquals(1,value.getInt("total"));assertTrue(value.getBoolean("pageable"))
 }
 @Test fun keepsReleaseGroupAndEditionIdentitySeparate() {
  val groups=JSONObject().put("release-group-count",2).put("release-groups",JSONArray().put(JSONObject().put("id",group).put("title","Disco").put("first-release-date","2000").put("primary-type","Album").put("artist-credit",credit())))
  val result=CatalogJson.parse(CatalogRequest("artist",id=artist,page=1),groups)
  assertEquals(2,result.getInt("total"));assertEquals(1,result.getInt("page"));assertEquals("group",result.getJSONArray("items").getJSONObject(0).getString("entity"))
  val edition=JSONObject().put("id",release).put("title","Disco").put("date","2026").put("country","BR").put("status","Official").put("artist-credit",credit())
  val editions=CatalogJson.parse(CatalogRequest("group",id=group),JSONObject().put("release-count",1).put("releases",JSONArray().put(edition)))
  assertEquals(release,editions.getJSONArray("items").getJSONObject(0).getString("id"));assertEquals("release",editions.getJSONArray("items").getJSONObject(0).getString("entity"))
 }
 @Test fun parsesMultipleDiscsAndUnknownLengthsWithoutInventingAudioUrls() {
  val media=JSONArray()
  for(disc in 1..2)media.put(JSONObject().put("position",disc).put("track-count",1).put("tracks",JSONArray().put(JSONObject().put("id","00000000-0000-0000-0000-00000000000${disc+3}").put("title","Faixa $disc").put("number","1").put("recording",JSONObject().put("id",artist).put("length",JSONObject.NULL)))))
  val value=CatalogJson.parse(CatalogRequest("release",id=release),JSONObject().put("id",release).put("title","Disco").put("artist-credit",credit()).put("media",media))
  assertEquals(2,value.getInt("total"));assertTrue(value.getBoolean("complete"));assertFalse(value.getBoolean("pageable"));assertTrue(value.getJSONArray("items").getJSONObject(0).isNull("duration"));assertTrue(value.getJSONArray("items").getJSONObject(1).getString("detail").startsWith("Disco 2"));assertFalse(value.toString().contains("audioUrl"))
 }
 @Test fun rejectsMismatchedIdentityMalformedListsDuplicateIdsAndNegativeDurations() {
  assertThrows(CatalogProblem::class.java){CatalogJson.parse(CatalogRequest("release",id=release),JSONObject().put("id",artist).put("title","Wrong").put("media",JSONArray()))}
  val raw=search();raw.getJSONArray("artists").put(raw.getJSONArray("artists").getJSONObject(0));assertThrows(CatalogProblem::class.java){CatalogJson.parse(CatalogRequest("search","valid"),raw)}
  val wrong=search();wrong.getJSONArray("artists").getJSONObject(0).put("length",-1);assertThrows(CatalogProblem::class.java){CatalogJson.parse(CatalogRequest("search","valid"),wrong)}
 }
 @Test fun marksRecordingReleaseListsAsPotentiallyIncomplete() {
  val value=CatalogJson.parse(CatalogRequest("recording",id=artist),JSONObject().put("id",artist).put("title","Gravação"))
  assertEquals(0,value.getInt("total"));assertFalse(value.getBoolean("complete"))
 }
 @Test fun boundedUtf8ReadRejectsOversizedInvalidAndCancelledStreams() {
  assertThrows(CatalogProblem::class.java){CatalogJson.read(ByteArray(CatalogJson.MAX_BYTES+1){32}.inputStream(),{false})}
  assertThrows(java.nio.charset.CharacterCodingException::class.java){CatalogJson.read(byteArrayOf(0xc3.toByte(),0x28).inputStream(),{false})}
  assertThrows(CancellationException::class.java){CatalogJson.read("{}".byteInputStream(),{true})}
 }
 @Test fun freshCacheAvoidsNetworkAndForcedRefreshFallsBackOffline()=withCache {cache,_->
  var calls=0;var fail=false;val now=1700000000000L
  val service=OnlineCatalog(cache,{_,_->calls++;if(fail)throw java.io.IOException();search()},{now})
  val request=CatalogRequest("search","Ação")
  assertFalse(service.load(request,false){false}.getBoolean("cached"));assertEquals(1,calls)
  assertTrue(service.load(request,false){false}.getBoolean("cached"));assertEquals(1,calls)
  fail=true;val offline=service.load(request,true){false};assertTrue(offline.getBoolean("cached"));assertTrue(offline.getBoolean("offline"));assertEquals(2,calls)
 }
 @Test fun invalidNetworkResultsNeverReplaceAValidCacheAndCancellationDoesNotFallBack()=withCache {cache,_->
  val request=CatalogRequest("search","valid");val now=1700000000000L
  OnlineCatalog(cache,{_,_->search()},{now}).load(request,false){false}
  val malformed=OnlineCatalog(cache,{_,_->JSONObject().put("unexpected",true)},{now+1000})
  assertTrue(malformed.load(request,true){false}.getBoolean("offline"))
  val cancelled=OnlineCatalog(cache,{_,_->throw CancellationException()},{now+1000})
  assertThrows(CancellationException::class.java){cancelled.load(request,true){false}}
  assertTrue(OnlineCatalog(cache,{_,_->error("must use valid cache")},{now+1000}).load(request,false){false}.getBoolean("cached"))
 }
 @Test fun staleOrCorruptCacheIsNotPresentedAsCurrentData()=withCache {cache,dir->
  val request=CatalogRequest("search","valid");val now=1700000000000L
  OnlineCatalog(cache,{_,_->search()},{now}).load(request,false){false}
  assertThrows(CatalogProblem::class.java){OnlineCatalog(cache,{_,_->throw java.io.IOException()},{now+31L*24*60*60*1000}).load(request,false){false}}
  dir.listFiles()!!.first().writeText("not-json")
  assertFalse(OnlineCatalog(cache,{_,_->search()},{now+1000}).load(request,false){false}.getBoolean("cached"))
 }
 @Test fun cacheEntryLimitDoesNotTouchAnythingOutsideItsDirectory()=withCache {cache,dir->
  repeat(45){cache.write("/query-$it",search(),1700000000000L+it)}
  assertTrue(dir.listFiles()!!.size<=40)
 }
 @Test fun atomicCacheRecoversAfterInterruptedWrite()=withCache {cache,dir->
  val request=CatalogRequest("search","valid");val now=1700000000000L
  OnlineCatalog(cache,{_,_->search()},{now}).load(request,false){false}
  val file=dir.listFiles()!!.first();assertTrue(file.renameTo(java.io.File(file.path+".bak")))
  assertTrue(OnlineCatalog(cache,{_,_->error("cache should recover")},{now+1}).load(request,false){false}.getBoolean("cached"))
 }

}
