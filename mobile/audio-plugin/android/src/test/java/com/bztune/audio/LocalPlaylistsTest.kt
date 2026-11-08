package com.bztune.audio

import android.content.Context
import org.json.JSONArray
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
class LocalPlaylistsTest {
    private val context:Context get()=RuntimeEnvironment.getApplication()
    private fun track(i:Int)=LibraryTrack(LibraryRules.id("content://test/$i"),"content://test/$i","Ação 日本語 $i","Artista","Disco","Artista","2026",123000,i==1)
    private val emptyQueue=QueueStore.encode(SavedQueue(emptyList(),-1,0,false,0))
    @Before fun reset(){context.deleteDatabase("local-library-v1.sqlite3")}
    private fun create(store:LocalPlaylists,name:String="日本語 e Ação"):String=store.edit("create","",name,"",emptyList(),-1).getJSONObject("selected").getString("id")
    private fun revision(store:LocalPlaylists,id:String)=store.snapshot(id).getJSONObject("selected").getLong("revision")
    private fun edit(store:LocalPlaylists,id:String,action:String,trackId:String="",order:List<String> = emptyList(),name:String="")=store.edit(action,id,name,trackId,order,revision(store,id))
    @Test fun createsRenamesAndReopensUnicodeNames() {
        var id=""
        LocalLibrary(context).use {library->val s=LocalPlaylists(library);id=create(s,"  Ação 日本語  ");assertEquals("Ação 日本語",s.saved().single().name);edit(s,id,"rename",name="Outra edição 2026")}
        LocalLibrary(context).use {library->val s=LocalPlaylists(library);assertEquals("Outra edição 2026",s.saved().single().name);assertEquals(1,revision(s,id))}
    }
    @Test fun addsDeduplicatesReordersAndRemovesWithoutChangingLibrary() {
        LocalLibrary(context).use {library->
            library.save((1..3).map {track(it)});val s=LocalPlaylists(library);val id=create(s)
            edit(s,id,"add",track(1).id);edit(s,id,"add",track(2).id);edit(s,id,"add",track(1).id)
            assertEquals(listOf(track(1).id,track(2).id),s.saved().single().trackIds)
            edit(s,id,"reorder",order=listOf(track(2).id,track(1).id));assertEquals(listOf(track(2).id,track(1).id),s.tracks(id,revision(s,id)).map {it.id})
            edit(s,id,"remove",track(2).id);assertEquals(listOf(track(1).id),s.saved().single().trackIds)
            assertEquals(3,library.page("","","",0).getInt("total"));assertTrue(library.get(track(1).id)!!.favorite)
        }
    }
    @Test fun staleAndInvalidRequestsLeaveLastValidOrderIntact() {
        LocalLibrary(context).use {library->
            library.save((1..2).map {track(it)});val s=LocalPlaylists(library);val id=create(s);val old=revision(s,id)
            edit(s,id,"add",track(1).id)
            assertEquals("PLAYLIST_CHANGED",assertThrows(PlaylistFailure::class.java){s.edit("rename",id,"Lost update","",emptyList(),old)}.code)
            assertThrows(PlaylistFailure::class.java){edit(s,id,"reorder",order=listOf(track(2).id))}
            assertThrows(PlaylistFailure::class.java){edit(s,id,"add","missing")}
            assertThrows(PlaylistFailure::class.java){s.tracks(id,old)}
            assertEquals(listOf(track(1).id),s.saved().single().trackIds)
        }
    }
    @Test fun deletingLibraryEntryUpdatesPlaylistsButNeverTouchesQueueOrAudio() {
        val original=java.io.File(context.filesDir,"playlist-original.audio").apply {writeText("original")}
        val prefs=context.getSharedPreferences("local-player-v1",Context.MODE_PRIVATE);prefs.edit().putString("queue","retained").commit()
        LocalLibrary(context).use {library->
            library.save(listOf(track(1),track(2)));val s=LocalPlaylists(library);val id=create(s)
            edit(s,id,"add",track(1).id);edit(s,id,"add",track(2).id);val old=revision(s,id)
            library.forget(track(1).id)
            assertEquals(listOf(track(2).id),s.saved().single().trackIds);assertTrue(revision(s,id)>old)
            edit(s,id,"delete");assertTrue(s.saved().isEmpty());assertNotNull(library.get(track(2).id))
            assertEquals(0,library.readableDatabase.rawQuery("SELECT COUNT(*) FROM playlist_entries",null).use {it.moveToFirst();it.getInt(0)})
        }
        assertEquals("original",original.readText());assertEquals("retained",prefs.getString("queue",null))
    }
    @Test fun enforcesNamesAndPlaylistLimitsWithoutSilentTruncation() {
        LocalLibrary(context).use {library->val s=LocalPlaylists(library)
            for(name in listOf(" ","x".repeat(121),"line\nbreak"))assertThrows(PlaylistFailure::class.java){create(s,name)}
            repeat(PlaylistRules.LIMIT){create(s,"Playlist $it")}
            assertEquals("PLAYLIST_LIMIT",assertThrows(PlaylistFailure::class.java){create(s)}.code)
            assertEquals(PlaylistRules.LIMIT,s.saved().size)
        }
    }
    @Test fun rejectsMusicBeyondQueueLimitAndPreservesExistingEntries() {
        LocalLibrary(context).use {library->
            library.save((0..QueueStore.LIMIT).map {track(it)});val s=LocalPlaylists(library);val id=create(s)
            val entries=(0 until QueueStore.LIMIT).map {track(it).id}
            s.restore(listOf(SavedPlaylist(id,"Full",entries)))
            assertEquals("PLAYLIST_LIMIT",assertThrows(PlaylistFailure::class.java){edit(s,id,"add",track(QueueStore.LIMIT).id)}.code)
            assertEquals(entries,s.saved().single().trackIds)
        }
    }
    @Test fun backupRoundTripPreservesOrderFavoritesAndRecoveryJournal() {
        var exported="";var saved=emptyList<SavedPlaylist>()
        LocalLibrary(context).use {library->
            library.save(listOf(track(1),track(2)));val s=LocalPlaylists(library);val id=create(s)
            edit(s,id,"add",track(2).id);edit(s,id,"add",track(1).id);saved=s.saved()
            exported=BackupStore.encode(library.backup(emptyQueue));edit(s,id,"delete")
            library.restore(BackupStore.decode(exported))
        }
        LocalLibrary(context).use {library->assertEquals(saved,LocalPlaylists(library).saved());assertTrue(library.get(track(1).id)!!.favorite);assertEquals(emptyQueue,library.pendingQueue())}
    }
    @Test fun legacyBackupsRestoreWithoutPlaylistsAndMalformedReferencesAreRejected() {
        LocalLibrary(context).use {library->
            library.save(listOf(track(1)));val s=LocalPlaylists(library);val id=create(s);edit(s,id,"add",track(1).id)
            val original=JSONObject(BackupStore.encode(library.backup(emptyQueue)))
            val invalid=JSONObject(original.toString());invalid.getJSONArray("playlists").getJSONObject(0).put("trackIds",JSONArray().put("missing"))
            assertThrows(IllegalArgumentException::class.java){BackupStore.decode(invalid.toString())}
            for(version in listOf(1,2)) {
                val old=JSONObject(original.toString()).put("version",version);old.remove("playlists");old.remove("albums");old.remove("added")
                if(version==1)old.getJSONArray("library").getJSONObject(0).remove("favorite")
                val data=BackupStore.decode(old.toString());assertTrue(data.playlists.isEmpty());library.restore(data)
                assertTrue(s.saved().isEmpty())
            }
        }
    }
    @Test fun interruptedPlaylistRestoreRollsBackAllData() {
        LocalLibrary(context).use {library->
            library.save(listOf(track(1)));val s=LocalPlaylists(library);val id=create(s);edit(s,id,"add",track(1).id)
            val before=library.backup(emptyQueue)
            library.writableDatabase.execSQL("CREATE TRIGGER reject_playlist BEFORE INSERT ON playlists WHEN NEW.name='REJECT' BEGIN SELECT RAISE(ABORT,'fixture'); END")
            val incoming=before.copy(library=listOf(track(2)),added=listOf(track(2).id),playlists=listOf(SavedPlaylist(id,"REJECT",listOf(track(2).id))))
            assertThrows(android.database.sqlite.SQLiteException::class.java){library.restore(incoming)}
            assertEquals(before.library,library.backup(emptyQueue).library);assertEquals(before.playlists,s.saved())
        }
    }
    @Test fun migratesVersionThreeKeepingFavoritesAndPendingQueue() {
        val old=object:android.database.sqlite.SQLiteOpenHelper(context,"local-library-v1.sqlite3",null,3) {
            override fun onCreate(db:android.database.sqlite.SQLiteDatabase) {
                db.execSQL("CREATE TABLE tracks(id TEXT PRIMARY KEY,uri TEXT NOT NULL UNIQUE,title TEXT NOT NULL,artist TEXT NOT NULL,album TEXT NOT NULL,album_artist TEXT NOT NULL,year TEXT NOT NULL,duration INTEGER NOT NULL,album_key TEXT NOT NULL,search_text TEXT NOT NULL,favorite INTEGER NOT NULL DEFAULT 0)")
                db.execSQL("CREATE TABLE app_state(key TEXT PRIMARY KEY,value TEXT NOT NULL)")
            }
            override fun onUpgrade(db:android.database.sqlite.SQLiteDatabase,a:Int,b:Int){}
        }
        try {old.writableDatabase.insertOrThrow("tracks",null,track(1).values());old.writableDatabase.execSQL("INSERT INTO app_state VALUES(?,?)",arrayOf("pending_queue_restore",emptyQueue))}finally{old.close()}
        LocalLibrary(context).use {library->assertTrue(library.get(track(1).id)!!.favorite);assertEquals(emptyQueue,library.pendingQueue());create(LocalPlaylists(library))}
    }
 @Test fun batchAddIsAtomicDeduplicatesAndChecksRevision(){LocalLibrary(context).use {l->
 l.save(listOf(track(1),track(2)));val store=LocalPlaylists(l);val created=store.edit("create","","Batch","",emptyList(),-1).getJSONObject("selected");val id=created.getString("id")
 store.edit("add_many",id,"","",listOf(track(1).id,track(2).id),0);assertEquals(2,store.saved().single().trackIds.size)
 assertThrows(PlaylistFailure::class.java){store.edit("add_many",id,"","",listOf(track(1).id,"missing"),1)};assertEquals(2,store.saved().single().trackIds.size)
 store.edit("add_many",id,"","",listOf(track(1).id),1);assertEquals(2,store.saved().single().trackIds.size)
 assertThrows(PlaylistFailure::class.java){store.edit("add_many",id,"","",listOf(track(2).id),1)}
 }}

}
