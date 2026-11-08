package com.bztune.audio
import org.junit.Test
import org.junit.Assert.*
class LyricsClientTest{
 @Test fun parsesPlainSyncedAndInstrumental(){val r=LyricsClient.parse("""{"syncedLyrics":"[00:01]Ação","plainLyrics":"Ação","instrumental":false}""");assertEquals("[00:01]Ação",r.getString("synced"));assertFalse(r.getBoolean("instrumental"));assertTrue(LyricsClient.parse("""{"instrumental":true}""").getBoolean("instrumental"))}
 @Test fun rejectsWrongTypesAndOversize(){assertThrows(IllegalArgumentException::class.java){LyricsClient.parse("""{"plainLyrics":5}""")};assertThrows(IllegalArgumentException::class.java){LyricsClient.parse("x".repeat(512*1024+1))}}
}
