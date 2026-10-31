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
            val old=AndroidBackup("",listOf(track(1,"Old").copy(favorite=true)),SavedQueue(emptyList(),-1,0,false,0))
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
        try {old.writableDatabase.insertOrThrow("tracks",null,track(1,"Preserved").values().apply {remove("favorite")})}finally {old.close()}
        LocalLibrary(context).use {library ->assertEquals("Preserved",library.get(track(1).id)?.title);assertNull(library.pendingQueue())}
    }
    @Test fun favoritesPersistAcrossReimportAndKeepSameTitlesInDifferentFilesSeparate() {
        LocalLibrary(context).use {library ->
            library.save(listOf(track(1,"Same"),track(2,"Same",year="2024")))
            library.setFavorite(track(1).id,true);library.setFavorite(track(1).id,true)
            library.save(listOf(track(1,"Updated")))
        }
        LocalLibrary(context).use {library ->
            assertTrue(library.get(track(1).id)!!.favorite)
            assertFalse(library.get(track(2).id)!!.favorite)
            assertEquals("Updated",library.get(track(1).id)!!.title)
            assertThrows(IllegalArgumentException::class.java) {library.setFavorite("missing",true)}
            library.setFavorite(track(1).id,false)
            assertEquals(0,library.page("","","",0,true).getInt("total"))
        }
    }
    @Test fun favoritesCombineWithFiltersAndPaginationWithoutChangingQueue() {
        val prefs=context.getSharedPreferences("local-player-v1",Context.MODE_PRIVATE)
        prefs.edit().putString("queue","untouched").commit()
        LocalLibrary(context).use {library ->
            library.save((0..60).map {track(it,"Ação $it").copy(favorite=it<51)})
            val page=library.page("acao","Artista","",1,true)
            assertEquals(51,page.getInt("total"));assertEquals(1,page.getJSONArray("items").length())
            assertTrue(page.getJSONArray("items").getJSONObject(0).getBoolean("favorite"))
            library.forget(track(0).id)
            assertEquals(0,library.page("","","",1,true).getInt("page"))
            assertEquals(0,library.page("","Outro","",0,true).getInt("total"))
        }
        assertEquals("untouched",prefs.getString("queue",null))
    }
    @Test fun backupRestoresFavoriteChoicesAndSqlFailurePreservesThem() {
        val queue=SavedQueue(emptyList(),-1,0,false,0)
        LocalLibrary(context).use {library ->
            library.save(listOf(track(1).copy(favorite=true),track(2)))
            val backup=BackupStore.decode(BackupStore.encode(library.backup(QueueStore.encode(queue))))
            library.setFavorite(track(1).id,false);library.setFavorite(track(2).id,true)
            library.restore(backup)
            assertTrue(library.get(track(1).id)!!.favorite);assertFalse(library.get(track(2).id)!!.favorite)
            library.writableDatabase.execSQL("CREATE TRIGGER reject_favorites BEFORE INSERT ON tracks WHEN NEW.title='REJECT' BEGIN SELECT RAISE(ABORT,'fixture'); END")
            assertThrows(android.database.sqlite.SQLiteException::class.java) {
                library.restore(AndroidBackup("",listOf(track(3,"REJECT")),queue))
            }
            assertTrue(library.get(track(1).id)!!.favorite)
        }
    }
    @Test fun migratesVersionTwoPreservingCatalogAndPendingRestore() {
        val old=object:android.database.sqlite.SQLiteOpenHelper(context,"local-library-v1.sqlite3",null,2) {
            override fun onCreate(db:android.database.sqlite.SQLiteDatabase) {
                db.execSQL("CREATE TABLE tracks(id TEXT PRIMARY KEY,uri TEXT NOT NULL UNIQUE,title TEXT NOT NULL,artist TEXT NOT NULL,album TEXT NOT NULL,album_artist TEXT NOT NULL,year TEXT NOT NULL,duration INTEGER NOT NULL,album_key TEXT NOT NULL,search_text TEXT NOT NULL)")
                db.execSQL("CREATE TABLE app_state(key TEXT PRIMARY KEY,value TEXT NOT NULL)")
            }
            override fun onUpgrade(db:android.database.sqlite.SQLiteDatabase,oldVersion:Int,newVersion:Int) { }
        }
        val queue=QueueStore.encode(SavedQueue(emptyList(),-1,0,false,0))
        try {
            old.writableDatabase.insertOrThrow("tracks",null,track(1).values().apply {remove("favorite")})
            old.writableDatabase.execSQL("INSERT INTO app_state(key,value) VALUES(?,?)",arrayOf("pending_queue_restore",queue))
        } finally {old.close()}
        LocalLibrary(context).use {library ->
            assertFalse(library.get(track(1).id)!!.favorite);assertEquals(queue,library.pendingQueue())
            library.setFavorite(track(1).id,true);assertTrue(library.get(track(1).id)!!.favorite)
        }
    }

    @Test fun playerDetailsUseQueueIdentityAndImportedMetadataWithoutChangingFavoriteChoices() {
        LocalLibrary(context).use {library ->
            val t=track(1,"Ação 日本語").copy(favorite=true);library.save(listOf(t))
            library.coverFile(t.id).writeBytes(byteArrayOf(0xff.toByte(),0xd8.toByte(),0xff.toByte(),0xd9.toByte()))
            val details=library.playerDetails("queue-entry",t.uri,"Old artist","Old album")
            assertEquals("queue-entry",details.getString("id"));assertEquals(t.artist,details.getString("artist"));assertEquals(t.album,details.getString("album"))
            assertTrue(details.getString("cover").startsWith("data:image/jpeg;base64,"));assertTrue(library.get(t.id)!!.favorite)
        }
    }
    @Test fun playerDetailsHandleMissingAndOversizedArtworkAndUnknownReferences() {
        LocalLibrary(context).use {library ->
            val t=track(1);library.save(listOf(t))
            assertTrue(library.playerDetails("entry",t.uri,"","").isNull("cover"))
            library.coverFile(t.id).writeBytes(ByteArray(150001))
            assertTrue(library.playerDetails("entry",t.uri,"","").isNull("cover"))
            val missing=library.playerDetails("unknown","content://not-imported/1","Native artist","Native album")
            assertEquals("Native artist",missing.getString("artist"));assertEquals("Native album",missing.getString("album"));assertTrue(missing.isNull("cover"))
            assertTrue(library.playerDetails("none",null,"","").isNull("cover"))
        }
    }

}
