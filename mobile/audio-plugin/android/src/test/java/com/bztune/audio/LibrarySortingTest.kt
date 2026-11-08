package com.bztune.audio
import android.content.Context
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
@RunWith(RobolectricTestRunner::class)
@Config(sdk=[24],manifest=Config.NONE)
class LibrarySortingTest {
 private val context:Context get()=RuntimeEnvironment.getApplication()
 private fun t(i:Int)=LibraryTrack(LibraryRules.id("content://sort/$i"),"content://sort/$i","Song %03d".format(i),"Artist %03d".format(60-i),"Album","Artist","2024",120000)
 @Before fun reset(){context.deleteDatabase("local-library-v1.sqlite3")}
 @Test fun sortsWholeCatalogBeforePaginationAndKeepsRecentOrderOnReimport(){LocalLibrary(context).use {l->
 l.save((0..60).map{t(it)});assertEquals(t(60).id,l.page("","","",0,false,"artist").getJSONArray("items").getJSONObject(0).getString("id"));assertEquals(t(10).id,l.page("","","",1,false,"recent").getJSONArray("items").getJSONObject(0).getString("id"));l.save(listOf(t(0)));assertEquals(t(60).id,l.page("","","",0,false,"recent").getJSONArray("items").getJSONObject(0).getString("id"));assertThrows(IllegalArgumentException::class.java){l.page("","","",0,false,"title; DROP TABLE tracks")}
 }}
 @Test fun albumCoverUsesAnAvailableTrackAndKeepsEmptyAlbums(){LocalLibrary(context).use {l->
 val a=t(1);val b=t(2);l.save(listOf(a,b));l.coverFile(b.id).writeBytes(byteArrayOf(0xff.toByte(),0xd8.toByte(),0xff.toByte(),0xd9.toByte()));val store=LocalAlbums(l);assertFalse(store.snapshot("","","all",0).getJSONArray("items").getJSONObject(0).isNull("cover"));val id=LibraryRules.albumKey(a.albumArtist,a.album,a.year);store.mark(id,false,true,false,false);l.forget(a.id);l.forget(b.id);assertTrue(store.snapshot("","","all",0).getJSONArray("items").getJSONObject(0).isNull("cover"))
 }}
}
