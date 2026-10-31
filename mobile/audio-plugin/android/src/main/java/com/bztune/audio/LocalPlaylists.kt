package com.bztune.audio

import android.content.ContentValues
import android.database.sqlite.SQLiteDatabase
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import java.util.UUID

internal data class SavedPlaylist(val id:String,val name:String,val trackIds:List<String>)
internal class PlaylistFailure(val code:String):Exception(code)
internal object PlaylistRules {
    const val LIMIT=100
    fun name(value:String):String=value.trim().also {if(it.isEmpty()||it.length>120||it.any {ch->ch.isISOControl()})throw PlaylistFailure("PLAYLIST_INVALID")}
    fun validId(value:String)=value.matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}".toRegex())
}
internal class LocalPlaylists(private val library:LocalLibrary) {
    private val db get()=library.writableDatabase
    companion object {
        fun create(db:SQLiteDatabase) {
            db.execSQL("CREATE TABLE playlists(id TEXT PRIMARY KEY,name TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0)")
            db.execSQL("CREATE TABLE playlist_entries(playlist_id TEXT NOT NULL,track_id TEXT NOT NULL,position INTEGER NOT NULL,PRIMARY KEY(playlist_id,track_id),UNIQUE(playlist_id,position),FOREIGN KEY(playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,FOREIGN KEY(track_id) REFERENCES tracks(id) ON DELETE CASCADE)")
        }
    }
    private fun revision(id:String):Long=db.rawQuery("SELECT revision FROM playlists WHERE id=?",arrayOf(id)).use {if(!it.moveToFirst())throw PlaylistFailure("PLAYLIST_CHANGED");it.getLong(0)}
    private fun checkRevision(id:String,expected:Long) {if(expected<0||revision(id)!=expected)throw PlaylistFailure("PLAYLIST_CHANGED")}
    private fun ids(id:String):List<String> = db.rawQuery("SELECT track_id FROM playlist_entries WHERE playlist_id=? ORDER BY position",arrayOf(id)).use {c->buildList {while(c.moveToNext())add(c.getString(0))}}
    private fun writeIds(id:String,tracks:List<String>) {
        if(tracks.size>QueueStore.LIMIT)throw PlaylistFailure("PLAYLIST_LIMIT")
        if(tracks.distinct().size!=tracks.size)throw PlaylistFailure("PLAYLIST_INVALID")
        db.delete("playlist_entries","playlist_id=?",arrayOf(id))
        tracks.forEachIndexed {i,track->db.insertOrThrow("playlist_entries",null,ContentValues().apply {put("playlist_id",id);put("track_id",track);put("position",i)})}
    }
    fun saved():List<SavedPlaylist> = db.rawQuery("SELECT id,name FROM playlists ORDER BY id",null).use {c->buildList {while(c.moveToNext())add(SavedPlaylist(c.getString(0),c.getString(1),ids(c.getString(0))))}}
    fun restore(saved:List<SavedPlaylist>) {
        db.delete("playlists",null,null)
        saved.forEach {p->db.insertOrThrow("playlists",null,ContentValues().apply {put("id",p.id);put("name",p.name)});writeIds(p.id,p.trackIds)}
    }
    fun snapshot(selectedId:String=""):JSObject {
        db.beginTransaction()
        try {
            val all=JSArray();var selected:Any=org.json.JSONObject.NULL
            db.rawQuery("SELECT id,name,revision,(SELECT COUNT(*) FROM playlist_entries e WHERE e.playlist_id=p.id) FROM playlists p ORDER BY name COLLATE NOCASE,id",null).use {c->while(c.moveToNext()) {
                val id=c.getString(0)
                val summary=JSObject().apply {put("id",id);put("name",c.getString(1));put("revision",c.getLong(2));put("count",c.getInt(3))}
                all.put(summary)
                if(id==selectedId)selected=JSObject(summary.toString()).apply {put("tracks",JSArray().apply {ids(id).forEach {trackId->
                    val t=library.get(trackId) ?: throw PlaylistFailure("PLAYLIST_CHANGED")
                    put(JSObject().apply {put("id",t.id);put("title",t.title);put("artist",t.artist);put("album",t.album)})
                }})}
            }}
            return JSObject().apply {put("playlists",all);put("selected",selected)}
        } finally {db.endTransaction()}
    }
    fun edit(action:String,id:String,name:String,trackId:String,ordered:List<String>,expected:Long):JSObject {
        var selected=id
        db.beginTransaction()
        try {
            if(action=="create") {
                if(saved().size>=PlaylistRules.LIMIT)throw PlaylistFailure("PLAYLIST_LIMIT")
                selected=UUID.randomUUID().toString()
                db.insertOrThrow("playlists",null,ContentValues().apply {put("id",selected);put("name",PlaylistRules.name(name))})
            } else {
                checkRevision(id,expected)
                when(action) {
                    "rename" -> db.update("playlists",ContentValues().apply {put("name",PlaylistRules.name(name))},"id=?",arrayOf(id))
                    "delete" -> {db.delete("playlists","id=?",arrayOf(id));selected=""}
                    "add" -> {
                        if(library.get(trackId)==null)throw PlaylistFailure("PLAYLIST_CHANGED")
                        val current=ids(id)
                        if(trackId !in current)writeIds(id,current+trackId)
                    }
                    "remove" -> {val current=ids(id);if(trackId !in current)throw PlaylistFailure("PLAYLIST_CHANGED");writeIds(id,current-trackId)}
                    "reorder" -> {val current=ids(id);if(current.size!=ordered.size||current.toSet()!=ordered.toSet())throw PlaylistFailure("PLAYLIST_CHANGED");writeIds(id,ordered)}
                    else -> throw PlaylistFailure("PLAYLIST_INVALID")
                }
                if(selected.isNotEmpty())db.execSQL("UPDATE playlists SET revision=revision+1 WHERE id=?",arrayOf(id))
            }
            db.setTransactionSuccessful()
        } finally {db.endTransaction()}
        return snapshot(selected)
    }
    fun tracks(id:String,expected:Long):List<LibraryTrack> {
        db.beginTransaction()
        try {checkRevision(id,expected);return ids(id).map {library.get(it) ?: throw PlaylistFailure("PLAYLIST_CHANGED")}}
        finally {db.endTransaction()}
    }
}
