package com.bztune.audio

import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

/** Opt-in public API smoke test. A provider outage is not a regression in local audio. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk=[24],manifest=Config.NONE)
class OnlineCatalogLiveTest {
 @Test fun artistToEditionToTracksUsingRealNativeTransport() {
  val marker=File(System.getProperty("bztune.catalog.live.report","build/reports/online-catalog-live.txt"));marker.delete()
  assumeTrue(System.getProperty("bztune.catalog.live")=="1")
  fun load(r:CatalogRequest)=CatalogJson.parse(r,MusicBrainzTransport.fetch(r.path()){false})
  val search=load(CatalogRequest("search","Kyuss"))
  val artists=search.getJSONArray("items")
  val artist=(0 until artists.length()).map {artists.getJSONObject(it)}.firstOrNull {it.getString("title").equals("Kyuss",true)} ?: error("Live artist not found")
  val groups=load(CatalogRequest("artist",id=artist.getString("id"))).getJSONArray("items")
  var trackCount=0;var selectedRelease=""
  for(i in 0 until minOf(groups.length(),3)) {
   val editions=load(CatalogRequest("group",id=groups.getJSONObject(i).getString("id"))).getJSONArray("items")
   if(editions.length()==0)continue
   selectedRelease=editions.getJSONObject(0).getString("id")
   val tracks=load(CatalogRequest("release",id=selectedRelease)).getJSONArray("items")
   trackCount=tracks.length();if(trackCount>0)break
  }
  assertTrue("No populated release found in bounded live probe",trackCount>0)
  marker.parentFile.mkdirs();marker.writeText("MUSICBRAINZ_LIVE_OK\nNative HTTPS transport and parser\nArtist: ${artist.getString("id")}\nRelease: $selectedRelease\nTracks parsed: $trackCount\nNo audio playback or Android-device TLS was tested.\n")
 }
}
