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
class LibraryHomeTest {
 private val context:Context get()=RuntimeEnvironment.getApplication()
 private val queue=QueueStore.encode(SavedQueue(emptyList(),-1,0,false,0))
 private fun track(i:Int)=LibraryTrack(LibraryRules.id("content://home/$i"),"content://home/$i","Música $i","Artista","Disco","Artista","2024",120000)
 @Before fun reset(){context.deleteDatabase("local-library-v1.sqlite3")}
 @Test fun samplesAreBoundedAndCountsUseAllTracks() {
  LocalLibrary(context).use {l->
   l.save((0..60).map {track(it).copy(favorite=it<10)})
   val home=l.home();assertEquals(61,home.getInt("total"));assertEquals(61,home.getInt("recentTotal"));assertEquals(10,home.getInt("favoriteTotal"))
   assertEquals(6,home.getJSONArray("recent").length());assertEquals(6,home.getJSONArray("favorites").length())
   assertEquals(track(60).id,home.getJSONArray("recent").getJSONObject(0).getString("id"))
  }
 }
 @Test fun reimportAndFavoriteDoNotReorderAndForgetRemovesHistory() {
  LocalLibrary(context).use {l->l.save(listOf(track(1),track(2)));l.setFavorite(track(1).id,true);l.save(listOf(track(1).copy(title="Updated")))}
  LocalLibrary(context).use {l->
   var home=l.home();assertEquals(track(2).id,home.getJSONArray("recent").getJSONObject(0).getString("id"));assertTrue(l.get(track(1).id)!!.favorite)
   l.forget(track(2).id);home=l.home();assertEquals(1,home.getInt("recentTotal"));assertEquals(track(1).id,home.getJSONArray("recent").getJSONObject(0).getString("id"))
   l.save(listOf(track(3)));assertEquals(track(3).id,l.home().getJSONArray("recent").getJSONObject(0).getString("id"))
  }
 }
 @Test fun versionFiveMigrationDoesNotInventHistoryAndPreservesSavedData() {
  var playlist="";val album=LibraryRules.albumKey("Artista","Disco","2024")
  LocalLibrary(context).use {l->
   l.save(listOf(track(1).copy(favorite=true)))
   val p=LocalPlaylists(l).edit("create","","Minha seleção","",emptyList(),-1);playlist=p.getJSONObject("selected").getString("id")
   LocalPlaylists(l).edit("add",playlist,"",track(1).id,emptyList(),0)
   LocalAlbums(l).mark(album,true,true,false,false)
   l.writableDatabase.execSQL("DROP TABLE track_additions");l.writableDatabase.version=5
  }
  LocalLibrary(context).use {l->
   assertEquals(6,l.readableDatabase.version);assertEquals(1,l.home().getInt("total"));assertEquals(0,l.home().getInt("recentTotal"));assertTrue(l.get(track(1).id)!!.favorite)
   assertEquals(listOf(track(1).id),LocalPlaylists(l).saved().single {it.id==playlist}.trackIds);assertTrue(LocalAlbums(l).saved().single().collected)
   l.save(listOf(track(1).copy(title="Reimported"),track(2)))
   assertEquals(1,l.home().getInt("recentTotal"));assertEquals(track(2).id,l.home().getJSONArray("recent").getJSONObject(0).getString("id"))
  }
 }
 @Test fun newBackupPreservesOrderAndLegacyBackupRestoresWithoutInventingIt() {
  LocalLibrary(context).use {l->
   l.save(listOf(track(3),track(1),track(2)))
   val backup=BackupStore.decode(BackupStore.encode(l.backup(queue)));assertEquals(listOf(track(3).id,track(1).id,track(2).id),backup.added)
   l.forget(track(2).id);l.restore(backup);assertEquals(track(2).id,l.home().getJSONArray("recent").getJSONObject(0).getString("id"))
   val legacy=JSONObject(BackupStore.encode(backup)).put("version",4);legacy.remove("added")
   l.restore(BackupStore.decode(legacy.toString()));assertEquals(3,l.home().getInt("total"));assertEquals(0,l.home().getInt("recentTotal"))
  }
 }
 @Test fun invalidHistoryAndFailedRestoreCannotReplaceCurrentData() {
  LocalLibrary(context).use {l->
   l.save(listOf(track(1)));val old=l.backup(queue)
   assertThrows(IllegalArgumentException::class.java){l.restore(old.copy(added=listOf(track(2).id)))}
   assertThrows(IllegalArgumentException::class.java){l.restore(old.copy(added=listOf(track(1).id,track(1).id)))}
   l.writableDatabase.execSQL("CREATE TRIGGER reject_home BEFORE INSERT ON tracks WHEN NEW.title='REJECT' BEGIN SELECT RAISE(ABORT,'fixture'); END")
   val incoming=old.copy(library=listOf(track(2).copy(title="REJECT")),added=listOf(track(2).id))
   assertThrows(android.database.sqlite.SQLiteException::class.java){l.restore(incoming)}
   assertEquals(old.added,l.backup(queue).added);assertEquals(track(1).id,l.home().getJSONArray("recent").getJSONObject(0).getString("id"));assertNull(l.get(track(2).id))
  }
 }
 @Test fun failedImportRollsBackNewRowsAndTheirHistoryTogether() {
  LocalLibrary(context).use {l->
   l.save(listOf(track(1)))
   l.writableDatabase.execSQL("CREATE TRIGGER reject_addition BEFORE INSERT ON track_additions WHEN NEW.position=3 BEGIN SELECT RAISE(ABORT,'fixture'); END")
   assertThrows(android.database.sqlite.SQLiteException::class.java){l.save(listOf(track(2),track(3)))}
   assertEquals(1,l.home().getInt("total"));assertEquals(1,l.home().getInt("recentTotal"));assertNull(l.get(track(2).id))
  }
 }
}
