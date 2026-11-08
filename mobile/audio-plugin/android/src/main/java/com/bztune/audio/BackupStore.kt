package com.bztune.audio

import org.json.JSONArray
import org.json.JSONObject
import java.io.InputStream

internal data class AndroidBackup(val createdAt:String,val library:List<LibraryTrack>,val queue:SavedQueue,val playlists:List<SavedPlaylist> = emptyList(),val albums:List<SavedAlbum> = emptyList(),val added:List<String> = emptyList())
internal object BackupStore {
    const val MAX_BYTES=10*1024*1024
    const val MAX_TRACKS=10000
    private fun fields(value:JSONObject,expected:Set<String>) {require(value.keys().asSequence().toSet()==expected)}
    fun trackJson(track:LibraryTrack)=JSONObject().apply {
        put("id",track.id);put("uri",track.uri);put("title",track.title);put("artist",track.artist)
        put("album",track.album);put("albumArtist",track.albumArtist);put("year",track.year);put("duration",track.duration);put("favorite",track.favorite)
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
        val rootFields=setOf("format","version","createdAt","library","queue")
        fields(root,rootFields+(if(root.optInt("version")>=3)setOf("playlists") else emptySet())+(if(root.optInt("version")>=4)setOf("albums") else emptySet())+(if(root.optInt("version")>=5)setOf("added") else emptySet()))
        require(root.getString("format")=="bztune-android-backup" && root.get("version") is Int && root.getInt("version") in 1..5)
        val version=root.getInt("version")
        val date=root.getString("createdAt");require(date.length<=64)
        val array=root.getJSONArray("library");require(array.length()<=MAX_TRACKS)
        val tracks=(0 until array.length()).map { index ->
            val row=array.getJSONObject(index)
            val expected=setOf("id","uri","title","artist","album","albumArtist","year","duration")
            fields(row,if(version>=2)expected+"favorite" else expected)
            if(version>=2)require(row.get("favorite") is Boolean)
            require(row.get("duration") is Int || row.get("duration") is Long)
            LibraryTrack(row.getString("id"),row.getString("uri"),row.getString("title"),row.getString("artist"),row.getString("album"),row.getString("albumArtist"),row.getString("year"),row.getLong("duration"),version>=2&&row.getBoolean("favorite")).also {
                require(it.uri.length<=8192 && it.id==LibraryRules.id(it.uri) && it.duration>=0)
            }
        }
        require(tracks.map{it.id}.distinct().size==tracks.size && tracks.map{it.uri}.distinct().size==tracks.size)
        val libraryIds=tracks.map {it.id}.toSet()
        val playlists=if(version>=3)root.getJSONArray("playlists").let {list->
            require(list.length()<=PlaylistRules.LIMIT)
            (0 until list.length()).map {i->
                val p=list.getJSONObject(i);fields(p,setOf("id","name","trackIds"))
                require(p.get("id") is String && PlaylistRules.validId(p.getString("id")))
                require(p.get("name") is String && PlaylistRules.name(p.getString("name"))==p.getString("name"))
                val refs=p.getJSONArray("trackIds");require(refs.length()<=QueueStore.LIMIT)
                val ids=(0 until refs.length()).map {j->require(refs.get(j) is String);refs.getString(j)}
                require(ids.distinct().size==ids.size && libraryIds.containsAll(ids))
                SavedPlaylist(p.getString("id"),p.getString("name"),ids)
            }.also {require(it.map {p->p.id}.distinct().size==it.size)}
        } else emptyList()
        val albums=if(version>=4)root.getJSONArray("albums").let {list->
            require(list.length()<=LocalAlbums.LIMIT)
            (0 until list.length()).map {i->
                val a=list.getJSONObject(i);fields(a,setOf("id","title","artist","year","favorite","collected"))
                require(listOf("id","title","artist","year").all {a.get(it) is String} && a.get("favorite") is Boolean && a.get("collected") is Boolean)
                SavedAlbum(a.getString("id"),a.getString("title"),a.getString("artist"),a.getString("year"),a.getBoolean("favorite"),a.getBoolean("collected")).also {
                    require(it.id==LibraryRules.albumKey(it.artist,it.title,it.year)&&(it.favorite||it.collected))
                }
            }.also {require(it.map {a->a.id}.distinct().size==it.size)}
        } else emptyList()
        val added=if(version>=5)root.getJSONArray("added").let {list->
            require(list.length()<=MAX_TRACKS)
            (0 until list.length()).map {i->require(list.get(i) is String);list.getString(i)}.also {require(it.distinct().size==it.size&&libraryIds.containsAll(it))}
        } else emptyList()
        return AndroidBackup(date,tracks,QueueStore.decode(root.getJSONObject("queue").toString()),playlists,albums,added)
    }
    fun encode(data:AndroidBackup):String {
        val array=JSONArray();data.library.forEach {array.put(trackJson(it))}
        val playlists=JSONArray();data.playlists.forEach {playlists.put(JSONObject().put("id",it.id).put("name",it.name).put("trackIds",JSONArray(it.trackIds)))}
        val albums=JSONArray();data.albums.forEach {albums.put(JSONObject().put("id",it.id).put("title",it.title).put("artist",it.artist).put("year",it.year).put("favorite",it.favorite).put("collected",it.collected))}
        val raw=JSONObject().put("format","bztune-android-backup").put("version",5).put("added",JSONArray(data.added)).put("playlists",playlists).put("albums",albums).put("createdAt",data.createdAt)
            .put("library",array).put("queue",JSONObject(QueueStore.encode(data.queue))).toString()
        decode(raw) // The exported format must pass its own restore contract.
        return raw
    }
    fun now():String=java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'",java.util.Locale.US).apply {timeZone=java.util.TimeZone.getTimeZone("UTC")}.format(java.util.Date())
}
