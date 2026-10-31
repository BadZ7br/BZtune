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
@Config(sdk=[24], manifest=Config.NONE)
class LocalLibraryTest {
    private val context:Context get()=RuntimeEnvironment.getApplication()
    private fun track(n:Int,title:String="Track $n",artist:String="Artista",album:String="Álbum",year:String="2020",albumArtist:String=artist):LibraryTrack {
        val uri="content://test/$n";return LibraryTrack(LibraryRules.id(uri),uri,title,artist,album,albumArtist,year,120000)
    }
    @Before fun reset() {context.deleteDatabase("local-library-v1.sqlite3")}
    @Test fun persistsAndUpdatesByUriWithoutHidingDifferentFiles() {
        LocalLibrary(context).use {it.save(listOf(track(1,"Same"),track(2,"Same")))}
        LocalLibrary(context).use { library ->
            library.save(listOf(track(1,"Updated")))
            assertEquals(2,library.page("","","",0).getInt("total"))
            assertEquals("Updated",library.get(track(1).id)?.title)
            assertEquals("Same",library.get(track(2).id)?.title)
        }
    }
    @Test fun paginatesWithoutTruncatingTheCatalogAndClampsAfterRemoval() {
        LocalLibrary(context).use { library ->
            library.save((0..124).map {track(it)})
            assertEquals(50,library.page("","","",0).getJSONArray("items").length())
            val last=library.page("","","",2)
            assertEquals(125,last.getInt("total"));assertEquals(25,last.getJSONArray("items").length())
            assertEquals(2,library.page("","","",999).getInt("page"))
        }
    }
    @Test fun searchesUnicodeAndTreatsWildcardAndSqlTextLiterally() {
        LocalLibrary(context).use { library ->
            library.save(listOf(track(1,"Ação"),track(2,"日本語"),track(3,"100% Doom_1"),track(4,"100x DoomA1")))
            for(query in listOf("acao","日本","%","_"))assertEquals(1,library.page(query,"","",0).getInt("total"))
            assertEquals(0,library.page("%' OR 1=1 --","","",0).getInt("total"))
        }
    }
    @Test fun filtersArtistAndKeepsAlbumYearsSeparate() {
        LocalLibrary(context).use { library ->
            library.save(listOf(track(1,year="2000"),track(2,year="2020"),track(3,artist="Outro")))
            assertEquals(2,library.page("","Artista","",0).getInt("total"))
            assertEquals(2,library.page("","Artista","",0).getJSONArray("albums").length())
            assertEquals(1,library.page("","Artista",LibraryRules.albumKey("Artista","Álbum","2000"),0).getInt("total"))
        }
    }
    @Test fun removingCatalogEntryOnlyRemovesItsPrivateThumbnail() {
        val prefs=context.getSharedPreferences("local-player-v1",Context.MODE_PRIVATE);prefs.edit().putString("queue","preserve queue").commit()
        val original=java.io.File(context.filesDir,"original-audio").apply {writeText("original")}
        LocalLibrary(context).use { library ->
            library.save(listOf(track(1)));val cover=library.coverFile(track(1).id);cover.writeText("thumbnail")
            library.forget(track(1).id)
            assertEquals(0,library.page("","","",0).getInt("total"));assertFalse(cover.exists())
            assertEquals("original",original.readText());assertEquals("preserve queue",prefs.getString("queue",null))
            assertThrows(IllegalArgumentException::class.java) {library.coverFile("../original-audio")}
        }
    }
    @Test fun restoreCommitsCatalogAndQueueJournalTogetherAndSurvivesReopen() {
        val queue=SavedQueue(listOf(SavedTrack("entry","content://test/2","New")),0,25000,false,1)
        val backup=AndroidBackup("",listOf(track(2,"New")),queue)
        LocalLibrary(context).use {it.save(listOf(track(1,"Old")));it.restore(backup)}
        LocalLibrary(context).use {library ->
            assertNull(library.get(track(1).id));assertEquals("New",library.get(track(2).id)?.title)
            val raw=library.pendingQueue()!!;assertEquals(queue,QueueStore.decode(raw))
            val newer=QueueStore.encode(queue.copy(position=30000));library.updatePending(newer)
            library.clearPending(raw);assertEquals(newer,library.pendingQueue())
            library.clearPending(newer);assertNull(library.pendingQueue())
        }
    }
    @Test fun interruptedSqlRestoreRollsBackCatalogAndJournal() {
        LocalLibrary(context).use {library ->
            val old=AndroidBackup("",listOf(track(1,"Old")),SavedQueue(emptyList(),-1,0,false,0))
            library.restore(old);val pending=library.pendingQueue()
            library.writableDatabase.execSQL("CREATE TRIGGER reject_fixture BEFORE INSERT ON tracks WHEN NEW.title='REJECT' BEGIN SELECT RAISE(ABORT,'fixture'); END")
            val incoming=AndroidBackup("",listOf(track(2,"Accepted first"),track(3,"REJECT")),SavedQueue(emptyList(),-1,0,false,0))
            assertThrows(android.database.sqlite.SQLiteException::class.java) {library.restore(incoming)}
            assertEquals("Old",library.get(track(1).id)?.title);assertNull(library.get(track(2).id));assertEquals(pending,library.pendingQueue())
        }
    }
    @Test fun migratesVersionOneWithoutDroppingTracks() {
        val old=object:android.database.sqlite.SQLiteOpenHelper(context,"local-library-v1.sqlite3",null,1) {
            override fun onCreate(db:android.database.sqlite.SQLiteDatabase) {db.execSQL("CREATE TABLE tracks(id TEXT PRIMARY KEY,uri TEXT NOT NULL UNIQUE,title TEXT NOT NULL,artist TEXT NOT NULL,album TEXT NOT NULL,album_artist TEXT NOT NULL,year TEXT NOT NULL,duration INTEGER NOT NULL,album_key TEXT NOT NULL,search_text TEXT NOT NULL)")}
            override fun onUpgrade(db:android.database.sqlite.SQLiteDatabase,oldVersion:Int,newVersion:Int) { }
        }
        try {old.writableDatabase.insertOrThrow("tracks",null,track(1,"Preserved").values())}finally {old.close()}
        LocalLibrary(context).use {library ->assertEquals("Preserved",library.get(track(1).id)?.title);assertNull(library.pendingQueue())}
    }
}
