package com.bztune.audio
import org.junit.Assert.*
import org.junit.Test
class LibraryRulesTest {
    @Test fun searchDoesNotEraseNonLatinNames() {assertEquals("acao 日本語",LibraryRules.search("AÇÃO 日本語"))}
    @Test fun differentYearsAndAlbumArtistsHaveDifferentKeys() {
        assertNotEquals(LibraryRules.albumKey("A","Same","2000"),LibraryRules.albumKey("A","Same","2020"))
        assertNotEquals(LibraryRules.albumKey("A","Same","2000"),LibraryRules.albumKey("B","Same","2000"))
    }
    @Test fun sameUriHasStableIdentityButSameTitleDoesNotDefineIdentity() {
        assertEquals(LibraryRules.id("content://a/1"),LibraryRules.id("content://a/1"))
        assertNotEquals(LibraryRules.id("content://a/1"),LibraryRules.id("content://a/2"))
    }
}
