package com.bztune.audio
import android.content.Context
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[24],manifest=Config.NONE)
class LocalAlbumsTest {
 private val context:Context get()=RuntimeEnvironment.getApplication()
 private val queue=QueueStore.encode(SavedQueue(emptyList(),-1,0,false,0))
 private fun track(i:Int,album:String="Ação 日本語",year:String="2000",albumArtist:String="Artista")=LibraryTrack(LibraryRules.id("content://albums/$i"),"content://albums/$i","Track $i","Singer",album,albumArtist,year,120000,true)
 @Before fun reset(){context.deleteDatabase("local-library-v1.sqlite3")}
 @Test fun keepsEditionsAndNonLatinNamesSeparateAndGroupsByAlbumArtist() {
  LocalLibrary(context).use {l->
   l.save(listOf(track(1),track(2,year="2024"),track(3,album="日本語"),track(4)))
   val s=LocalAlbums(l);val page=s.snapshot("","","all",0)
   assertEquals(3,page.getInt("total"))
   assertEquals(2,s.snapshot("acao","","all",0).getInt("total"))
   assertEquals(1,s.snapshot("","Artista","all",0).getJSONArray("artists").length())
   assertEquals(4,l.page("","Artista","",0).getInt("total"))
   assertEquals(2,l.page("","",LibraryRules.albumKey("Artista","Ação 日本語","2000"),0).getInt("total"))
  }
 }
 @Test fun favoriteAndCollectionAreIndependentFromTrackFavoritesAndSurviveReopenAndRemoval() {
  val id=LibraryRules.albumKey("Artista","Ação 日本語","2000")
  LocalLibrary(context).use {l->
   l.save(listOf(track(1)));val s=LocalAlbums(l);s.mark(id,true,true,false,false)
   assertEquals(1,s.snapshot("","","favorites",0).getInt("total"));assertEquals(1,s.snapshot("","","collection",0).getInt("total"))
   assertTrue(l.get(track(1).id)!!.favorite);l.save(listOf(track(1).copy(title="Renamed track")));assertEquals(1,s.saved().size)
   l.forget(track(1).id)
  }
  LocalLibrary(context).use {l->val s=LocalAlbums(l);assertEquals(0,s.snapshot("","","collection",0).getJSONArray("items").getJSONObject(0).getInt("count"));s.mark(id,false,true,true,true);assertFalse(s.saved().single().favorite);s.mark(id,false,false,false,true);assertTrue(s.saved().isEmpty())}
 }
 @Test fun rejectsStaleChoiceAndPaginatesWithoutDroppingAlbums() {
  LocalLibrary(context).use {l->
   l.save((0..54).map {track(it,album="Disco $it")});val s=LocalAlbums(l)
   assertEquals(55,s.snapshot("","","all",0).getInt("total"));assertEquals(5,s.snapshot("","","all",1).getJSONArray("items").length())
   val id=LibraryRules.albumKey("Artista","Disco 0","2000");s.mark(id,true,false,false,false)
   assertEquals("ALBUM_CHANGED",assertThrows(AlbumFailure::class.java){s.mark(id,false,true,false,false)}.code)
   assertTrue(s.saved().single().favorite);assertFalse(s.saved().single().collected)
   assertThrows(AlbumFailure::class.java){s.mark("missing",true,true,false,false)}
  }
 }
 @Test fun backupRoundTripAndSqlRollbackPreserveAllAlbumMarks() {
  LocalLibrary(context).use {l->
   l.save(listOf(track(1)));val s=LocalAlbums(l);val id=LibraryRules.albumKey("Artista","Ação 日本語","2000");s.mark(id,true,true,false,false)
   val backup=BackupStore.decode(BackupStore.encode(l.backup(queue)));s.mark(id,false,false,true,true);l.restore(backup);assertEquals(backup.albums,s.saved())
   l.writableDatabase.execSQL("CREATE TRIGGER reject_album BEFORE INSERT ON album_marks BEGIN SELECT RAISE(ABORT,'fixture'); END")
   assertThrows(android.database.sqlite.SQLiteException::class.java){l.restore(backup.copy(library=listOf(track(2)),added=emptyList()))}
   assertNotNull(l.get(track(1).id));assertNull(l.get(track(2).id));assertEquals(backup.albums,s.saved())
  }
 }
 @Test fun versionThreeBackupKeepsPlaylistsButHasNoAlbumMarks() {
  LocalLibrary(context).use {l->
   l.save(listOf(track(1)));val p=LocalPlaylists(l);p.edit("create","","Saved playlist","",emptyList(),-1)
   val id=LibraryRules.albumKey("Artista","Ação 日本語","2000");LocalAlbums(l).mark(id,true,true,false,false)
   val json=JSONObject(BackupStore.encode(l.backup(queue))).put("version",3);json.remove("albums");json.remove("added")
   val data=BackupStore.decode(json.toString());assertEquals(1,data.playlists.size);assertTrue(data.albums.isEmpty());l.restore(data);assertTrue(LocalAlbums(l).saved().isEmpty());assertEquals(1,p.saved().size)
  }
 }
 @Test fun malformedAlbumIdentitiesFlagsAndDuplicateMarksCannotReplaceData() {
  val a=SavedAlbum(LibraryRules.albumKey("Artist","Album","2000"),"Album","Artist","2000",true,false)
  val data=AndroidBackup("",emptyList(),QueueStore.decode(queue),emptyList(),listOf(a))
  assertEquals(data,BackupStore.decode(BackupStore.encode(data)))
  val invalid=JSONObject(BackupStore.encode(data));invalid.getJSONArray("albums").getJSONObject(0).put("favorite","true")
  assertThrows(IllegalArgumentException::class.java){BackupStore.decode(invalid.toString())}
  assertThrows(IllegalArgumentException::class.java){BackupStore.encode(data.copy(albums=listOf(a,a)))}
  assertThrows(IllegalArgumentException::class.java){BackupStore.encode(data.copy(albums=listOf(a.copy(year="2026"))))}
  assertThrows(IllegalArgumentException::class.java){BackupStore.encode(data.copy(albums=listOf(a.copy(favorite=false))))}
 }
 @Test fun upgradesVersionFourWithoutChangingPlaylistsOrFavoriteTracks() {
  LocalLibrary(context).use {l->l.save(listOf(track(1)));LocalPlaylists(l).edit("create","","Preserved","",emptyList(),-1);l.writableDatabase.execSQL("DROP TABLE album_marks");l.writableDatabase.version=4}
  LocalLibrary(context).use {l->assertTrue(l.get(track(1).id)!!.favorite);assertEquals("Preserved",LocalPlaylists(l).saved().single().name);assertTrue(LocalAlbums(l).saved().isEmpty())}
 }
 @Test fun rejectsSavedAlbumOverflowWithoutDroppingExistingMarks() {
  LocalLibrary(context).use {l->
   l.save(listOf(track(1)));val s=LocalAlbums(l)
   val marked=(0 until LocalAlbums.LIMIT).map {i->val title="Saved $i";SavedAlbum(LibraryRules.albumKey("Artist",title,"2000"),title,"Artist","2000",false,true)}
   s.restore(marked)
   val id=LibraryRules.albumKey("Artista","Ação 日本語","2000")
   assertEquals("ALBUM_LIMIT",assertThrows(AlbumFailure::class.java){s.mark(id,true,true,false,false)}.code)
   assertEquals(marked,s.saved().sortedBy {it.title.removePrefix("Saved ").toInt()})
   assertThrows(IllegalArgumentException::class.java){BackupStore.encode(AndroidBackup("",emptyList(),QueueStore.decode(queue),emptyList(),marked+SavedAlbum(id,"Ação 日本語","Artista","2000",true,false)))}
  }
 }

 @Test fun detailUsesExactIdentityBeyondFirstPageAndReturnsFreshFlags() {
  LocalLibrary(context).use {l->
   l.save((0..59).map {track(it,album="Disco $it")});val s=LocalAlbums(l)
   val target=LibraryRules.albumKey("Artista","Disco 9","2000")
   val row=s.snapshot("","","all",0,target)
   assertEquals(1,row.getInt("total"));assertEquals(target,row.getJSONArray("items").getJSONObject(0).getString("id"))
   s.mark(target,true,true,false,false)
   assertTrue(s.snapshot("","","all",0,target).getJSONArray("items").getJSONObject(0).getBoolean("collected"))
   assertEquals(0,s.snapshot("","","all",0,"missing").getInt("total"))
  }
 }
 @Test fun detailDistinguishesSameTitleEditionsAndPreservesEmptyCollection() {
  LocalLibrary(context).use {l->
   l.save(listOf(track(1),track(2,year="2024")));val s=LocalAlbums(l)
   val id=LibraryRules.albumKey("Artista","Ação 日本語","2000");s.mark(id,false,true,false,false);l.forget(track(1).id)
   val row=s.snapshot("","","all",0,id).getJSONArray("items").getJSONObject(0)
   assertEquals("2000",row.getString("year"));assertEquals(0,row.getInt("count"));assertTrue(row.getBoolean("collected"))
   assertEquals(1,s.snapshot("","","all",0,LibraryRules.albumKey("Artista","Ação 日本語","2024")).getJSONArray("items").getJSONObject(0).getInt("count"))
  }
 }

}
