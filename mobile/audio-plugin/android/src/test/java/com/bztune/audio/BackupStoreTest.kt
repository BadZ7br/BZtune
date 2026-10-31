package com.bztune.audio
import org.junit.Assert.*
import org.junit.Test

class BackupStoreTest {
    private val track=LibraryTrack(LibraryRules.id("content://test/one"),"content://test/one","Ação 日本語","Artista","Álbum","Artista","2024",123000,true)
    private val queue=SavedQueue(listOf(SavedTrack("entry","content://test/one","Ação 日本語","Artista","Álbum")),0,42000,true,2)
    private val data=AndroidBackup("2026-10-31T00:00:00Z",listOf(track),queue)
    @Test fun exportedBackupPassesRestoreContractWithoutLosingUnicodeOrModes() {assertEquals(data,BackupStore.decode(BackupStore.encode(data)))}
    @Test fun emptyCatalogAndQueueRoundTrip() {
        val empty=AndroidBackup("",emptyList(),SavedQueue(emptyList(),-1,0,false,0))
        assertEquals(empty,BackupStore.decode(BackupStore.encode(empty)))
    }
    @Test fun rejectsUnknownFieldsAndVersionsInsteadOfDiscardingData() {
        val raw=BackupStore.encode(data)
        for(invalid in listOf(raw.replace("\"version\":3","\"version\":4"),raw.replaceFirst("{","{\"futureData\":true,"))) {
            assertThrows(IllegalArgumentException::class.java) {BackupStore.decode(invalid)}
        }
    }
    @Test fun rejectsDuplicateReferencesAndForgedIds() {
        assertThrows(IllegalArgumentException::class.java) {BackupStore.encode(data.copy(library=listOf(track,track)))}
        assertThrows(IllegalArgumentException::class.java) {BackupStore.encode(data.copy(library=listOf(track.copy(id="../audio"))))}
        assertThrows(IllegalArgumentException::class.java) {BackupStore.encode(data.copy(library=listOf(track.copy(uri="https://example.test/song"))))}
    }
    @Test fun rejectsNegativeAndFractionalDurations() {
        assertThrows(IllegalArgumentException::class.java) {BackupStore.encode(data.copy(library=listOf(track.copy(duration=-1))))}
        assertThrows(IllegalArgumentException::class.java) {BackupStore.decode(BackupStore.encode(data).replace("\"duration\":123000","\"duration\":1.5"))}
    }
    @Test fun refusesOversizedStreamsAndMalformedUtf8() {
        assertThrows(IllegalArgumentException::class.java) {BackupStore.read(ByteArray(BackupStore.MAX_BYTES+1){32}.inputStream())}
        assertThrows(java.nio.charset.CharacterCodingException::class.java) {BackupStore.read(byteArrayOf(0xc3.toByte(),0x28).inputStream())}
    }
    @Test fun invalidQueueCannotBeExportedAsRestorable() {
        assertThrows(IllegalArgumentException::class.java) {BackupStore.encode(data.copy(queue=queue.copy(index=9)))}
    }
    @Test fun readsVersionOneBackupAndExportsVersionThreeWithNoInventedFavorites() {
        val legacy=org.json.JSONObject(BackupStore.encode(data)).put("version",1)
        legacy.remove("playlists")
        legacy.getJSONArray("library").getJSONObject(0).remove("favorite")
        val imported=BackupStore.decode(legacy.toString())
        assertFalse(imported.library.single().favorite)
        assertEquals(data.queue,imported.queue)
        assertEquals(3,org.json.JSONObject(BackupStore.encode(imported)).getInt("version"))
    }
    @Test fun rejectsFavoriteValuesThatAreNotBooleans() {
        for(value in listOf<Any>("true",1,org.json.JSONObject.NULL)) {
            val root=org.json.JSONObject(BackupStore.encode(data))
            root.getJSONArray("library").getJSONObject(0).put("favorite",value)
            assertThrows(IllegalArgumentException::class.java) {BackupStore.decode(root.toString())}
        }
    }

}
