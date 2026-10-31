package com.bztune.audio

import org.junit.Assert.*
import org.junit.Test

class QueueStoreTest {
    private val tracks = listOf(SavedTrack("a", "content://music/a", "Ação"), SavedTrack("b", "content://music/b", "日本語"))
    @Test fun restoresOrderCurrentPositionAndModes() {
        val state = SavedQueue(tracks, 1, 42000, true, 2)
        assertEquals(state, QueueStore.decode(QueueStore.encode(state)))
    }
    @Test fun emptyQueueCannotResurrectPreviousTrack() {
        val empty = SavedQueue(emptyList(), -1, 0, false, 0)
        assertEquals(empty, QueueStore.decode(QueueStore.encode(empty)))
    }
    @Test fun rejectsInvalidIndexInsteadOfSilentlySelectingWrongSong() {
        assertThrows(IllegalArgumentException::class.java) { QueueStore.decode(QueueStore.encode(SavedQueue(tracks, 8, 0, false, 0))) }
    }
    @Test fun rejectsNonContentSources() {
        assertThrows(IllegalArgumentException::class.java) { QueueStore.decode(QueueStore.encode(SavedQueue(listOf(SavedTrack("a", "http://localhost:5000/a", "A")), 0, 0, false, 0))) }
    }
    @Test fun rejectsDuplicateIdentitiesButAllowsSameFileTwice() {
        assertThrows(IllegalArgumentException::class.java) { QueueStore.decode(QueueStore.encode(SavedQueue(listOf(tracks[0],tracks[0]), 0, 0, false, 0))) }
        val state = SavedQueue(listOf(tracks[0],tracks[0].copy(id="another")), 1, 0, false, 0)
        assertEquals(state, QueueStore.decode(QueueStore.encode(state)))
    }
    @Test fun rejectsOversizedQueueRatherThanTruncatingIt() {
        val entries = (0..QueueStore.LIMIT).map { SavedTrack(it.toString(), "content://music/$it", "Track") }
        assertThrows(IllegalArgumentException::class.java) { QueueStore.decode(QueueStore.encode(SavedQueue(entries, 0, 0, false, 0))) }
    }
    @Test fun rejectsCoercedNumbersAndNegativePosition() {
        val raw = QueueStore.encode(SavedQueue(tracks, 0, 0, false, 0))
        for (invalid in listOf(raw.replace("\"index\":0", "\"index\":0.5"), raw.replace("\"position\":0", "\"position\":-1"))) {
            assertThrows(IllegalArgumentException::class.java) { QueueStore.decode(invalid) }
        }
    }
    @Test fun retainsLibraryMetadataAndReadsLegacyQueue() {
        val track = tracks[0].copy(artist="Artista",album="Álbum")
        val queue = SavedQueue(listOf(track),0,0,false,0)
        assertEquals(queue,QueueStore.decode(QueueStore.encode(queue)))
        val legacy=QueueStore.encode(queue).replace(",\"artist\":\"Artista\"", "").replace("\"artist\":\"Artista\",", "")
        assertEquals("",QueueStore.decode(legacy).tracks[0].artist)
    }
}
