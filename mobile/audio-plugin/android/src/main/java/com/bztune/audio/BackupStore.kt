package com.bztune.audio

import org.json.JSONArray
import org.json.JSONObject
import java.io.InputStream

internal data class AndroidBackup(val createdAt:String,val library:List<LibraryTrack>,val queue:SavedQueue)
internal object BackupStore {
    const val MAX_BYTES=10*1024*1024
    const val MAX_TRACKS=10000
    private fun fields(value:JSONObject,expected:Set<String>) {require(value.keys().asSequence().toSet()==expected)}
    fun trackJson(track:LibraryTrack)=JSONObject().apply {
        put("id",track.id);put("uri",track.uri);put("title",track.title);put("artist",track.artist)
        put("album",track.album);put("albumArtist",track.albumArtist);put("year",track.year);put("duration",track.duration)
    }
    fun read(input:InputStream):AndroidBackup {
        val out=java.io.ByteArrayOutputStream();val buffer=ByteArray(8192)
        while(true){val count=input.read(buffer);if(count<0)break;require(out.size()+count<=MAX_BYTES);out.write(buffer,0,count)}
        val decoder=Charsets.UTF_8.newDecoder().onMalformedInput(java.nio.charset.CodingErrorAction.REPORT).onUnmappableCharacter(java.nio.charset.CodingErrorAction.REPORT)
        return decode(decoder.decode(java.nio.ByteBuffer.wrap(out.toByteArray())).toString())
    }
    fun decode(raw:String):AndroidBackup {
        require(raw.toByteArray(Charsets.UTF_8).size<=MAX_BYTES)
        val root=JSONObject(raw)
        fields(root,setOf("format","version","createdAt","library","queue"))
        require(root.getString("format")=="bztune-android-backup" && root.get("version") is Int && root.getInt("version")==1)
        val date=root.getString("createdAt");require(date.length<=64)
        val array=root.getJSONArray("library");require(array.length()<=MAX_TRACKS)
        val tracks=(0 until array.length()).map { index ->
            val row=array.getJSONObject(index);fields(row,setOf("id","uri","title","artist","album","albumArtist","year","duration"))
            require(row.get("duration") is Int || row.get("duration") is Long)
            LibraryTrack(row.getString("id"),row.getString("uri"),row.getString("title"),row.getString("artist"),row.getString("album"),row.getString("albumArtist"),row.getString("year"),row.getLong("duration")).also {
                require(it.uri.length<=8192 && it.id==LibraryRules.id(it.uri) && it.duration>=0)
            }
        }
        require(tracks.map{it.id}.distinct().size==tracks.size && tracks.map{it.uri}.distinct().size==tracks.size)
        return AndroidBackup(date,tracks,QueueStore.decode(root.getJSONObject("queue").toString()))
    }
    fun encode(data:AndroidBackup):String {
        val array=JSONArray();data.library.forEach {array.put(trackJson(it))}
        val raw=JSONObject().put("format","bztune-android-backup").put("version",1).put("createdAt",data.createdAt)
            .put("library",array).put("queue",JSONObject(QueueStore.encode(data.queue))).toString()
        decode(raw) // The exported format must pass its own restore contract.
        return raw
    }
    fun now():String=java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'",java.util.Locale.US).apply {timeZone=java.util.TimeZone.getTimeZone("UTC")}.format(java.util.Date())
}
