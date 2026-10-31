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
}
