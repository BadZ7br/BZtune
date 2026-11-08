package com.bztune.audio

import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.util.Base64
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import java.io.File
import java.text.Normalizer
import java.util.Locale
import java.util.UUID

internal object LibraryRules {
    fun search(value: String) = Normalizer.normalize(value, Normalizer.Form.NFD)
        .replace("\\p{M}+".toRegex(), "").lowercase(Locale.ROOT)
    fun like(value: String) = "%" + search(value).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
    fun id(uri: String): String { require(uri.startsWith("content://")); return UUID.nameUUIDFromBytes(uri.toByteArray(Charsets.UTF_8)).toString() }
    fun albumKey(artist: String, album: String, year: String) = UUID.nameUUIDFromBytes(
        listOf(artist,album,year).joinToString("") { "${it.length}:$it" }.toByteArray(Charsets.UTF_8)).toString()
}
internal data class LibraryTrack(val id:String, val uri:String, val title:String, val artist:String,
    val album:String, val albumArtist:String, val year:String, val duration:Long, val favorite:Boolean=false) {
    fun values() = ContentValues().apply {
        put("id",id); put("uri",uri); put("title",title); put("artist",artist); put("album",album)
        put("album_artist",albumArtist); put("year",year); put("duration",duration)
        put("favorite",if(favorite) 1 else 0)
        put("album_key",LibraryRules.albumKey(albumArtist,album,year))
        put("search_text",LibraryRules.search("$title $artist $album $albumArtist $year"))
    }
}
internal class LocalLibrary(private val context:Context) : SQLiteOpenHelper(context, "local-library-v1.sqlite3", null, 6), java.io.Closeable {
    override fun onConfigure(db:SQLiteDatabase) {db.setForeignKeyConstraintsEnabled(true)}
    override fun onCreate(db:SQLiteDatabase) {
        db.execSQL("CREATE TABLE tracks(id TEXT PRIMARY KEY,uri TEXT NOT NULL UNIQUE,title TEXT NOT NULL,artist TEXT NOT NULL,album TEXT NOT NULL,album_artist TEXT NOT NULL,year TEXT NOT NULL,duration INTEGER NOT NULL,album_key TEXT NOT NULL,search_text TEXT NOT NULL,favorite INTEGER NOT NULL DEFAULT 0 CHECK(favorite IN (0,1)))")
        createState(db)
        LocalPlaylists.create(db)
        LocalAlbums.create(db)
        createAdditions(db)
        db.execSQL("CREATE INDEX library_artist ON tracks(artist)"); db.execSQL("CREATE INDEX library_album ON tracks(album_key)")
    }
    private fun createAdditions(db:SQLiteDatabase) {db.execSQL("CREATE TABLE IF NOT EXISTS track_additions(track_id TEXT PRIMARY KEY,position INTEGER NOT NULL UNIQUE CHECK(position>0),FOREIGN KEY(track_id) REFERENCES tracks(id) ON DELETE CASCADE)")}
    private fun createState(db:SQLiteDatabase) {db.execSQL("CREATE TABLE IF NOT EXISTS app_state(key TEXT PRIMARY KEY,value TEXT NOT NULL)")}
    override fun onUpgrade(db:SQLiteDatabase, oldVersion:Int, newVersion:Int) {
        if(oldVersion<2)createState(db)
        if(oldVersion<3)db.execSQL("ALTER TABLE tracks ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0 CHECK(favorite IN (0,1))")
        if(oldVersion<4)LocalPlaylists.create(db)
        if(oldVersion<5)LocalAlbums.create(db)
        if(oldVersion<6)createAdditions(db)
    }
    fun pendingQueue():String?=readableDatabase.query("app_state",arrayOf("value"),"key=?",arrayOf("pending_queue_restore"),null,null,null).use {if(it.moveToFirst())it.getString(0) else null}
    fun clearPending(raw:String) {writableDatabase.delete("app_state","key=? AND value=?",arrayOf("pending_queue_restore",raw))}
    fun updatePending(raw:String) {writableDatabase.update("app_state",ContentValues().apply {put("value",raw)},"key=?",arrayOf("pending_queue_restore"))}
    fun backup(queueRaw:String):AndroidBackup {
        val db=readableDatabase;db.beginTransaction()
        try {
            val count=db.rawQuery("SELECT COUNT(*) FROM tracks",null).use {it.moveToFirst();it.getInt(0)}
            require(count<=BackupStore.MAX_TRACKS)
            val entries=mutableListOf<LibraryTrack>()
            db.query("tracks",arrayOf("id","uri","title","artist","album","album_artist","year","duration","favorite"),null,null,null,null,"id").use {c ->
                while(c.moveToNext())entries.add(LibraryTrack(c.getString(0),c.getString(1),c.getString(2),c.getString(3),c.getString(4),c.getString(5),c.getString(6),c.getLong(7),c.getInt(8)==1))
            }
            return AndroidBackup(BackupStore.now(),entries,QueueStore.decode(pendingQueue() ?: queueRaw),LocalPlaylists(this).saved(),LocalAlbums(this).saved(),addedIds(db))
        } finally {db.endTransaction()}
    }
    fun restore(data:AndroidBackup) {
        // Validate every value before the first mutation; queue journal shares the transaction.
        BackupStore.decode(BackupStore.encode(data))
        val db=writableDatabase;db.beginTransaction()
        try {
            db.delete("playlists",null,null)
            db.delete("tracks",null,null)
            data.library.forEach {db.insertOrThrow("tracks",null,it.values())}
            LocalPlaylists(this).restore(data.playlists)
            LocalAlbums(this).restore(data.albums)
            data.added.forEachIndexed {index,id->db.insertOrThrow("track_additions",null,ContentValues().apply {put("track_id",id);put("position",index+1)})}
            check(db.insertWithOnConflict("app_state",null,ContentValues().apply {put("key","pending_queue_restore");put("value",QueueStore.encode(data.queue))},SQLiteDatabase.CONFLICT_REPLACE)!=-1L)
            db.setTransactionSuccessful()
        } finally {db.endTransaction()}
    }
    fun save(tracks:List<LibraryTrack>) {
        val db=writableDatabase; db.beginTransaction()
        try {
            var position=db.rawQuery("SELECT COALESCE(MAX(position),0) FROM track_additions",null).use {it.moveToFirst();it.getLong(0)}
            tracks.forEach { track ->
                // Reimport only updates metadata, preserving the user's favorite choice.
                val metadata=track.values().apply {remove("favorite")}
                if(db.update("tracks",metadata,"uri=?",arrayOf(track.uri))==0) {
                    db.insertOrThrow("tracks",null,track.values());position=Math.addExact(position,1L)
                    db.insertOrThrow("track_additions",null,ContentValues().apply {put("track_id",track.id);put("position",position)})
                }
            }
            db.setTransactionSuccessful()
        } finally { db.endTransaction() }
    }
    fun get(id:String):LibraryTrack? = readableDatabase.query("tracks",null,"id=?",arrayOf(id),null,null,null).use { c ->
        if(!c.moveToFirst()) null else LibraryTrack(c.getString(c.getColumnIndexOrThrow("id")), c.getString(c.getColumnIndexOrThrow("uri")),
            c.getString(c.getColumnIndexOrThrow("title")), c.getString(c.getColumnIndexOrThrow("artist")), c.getString(c.getColumnIndexOrThrow("album")),
            c.getString(c.getColumnIndexOrThrow("album_artist")), c.getString(c.getColumnIndexOrThrow("year")), c.getLong(c.getColumnIndexOrThrow("duration")), c.getInt(c.getColumnIndexOrThrow("favorite"))==1)
    }
    fun setFavorite(id:String,favorite:Boolean) {
        require(writableDatabase.update("tracks",ContentValues().apply {put("favorite",if(favorite) 1 else 0)},"id=?",arrayOf(id))==1)
    }
    fun forget(id:String) {
        val db=writableDatabase;db.beginTransaction()
        try {
            db.execSQL("UPDATE playlists SET revision=revision+1 WHERE id IN (SELECT playlist_id FROM playlist_entries WHERE track_id=?)",arrayOf(id))
            db.delete("tracks","id=?",arrayOf(id))
            db.setTransactionSuccessful()
        } finally {db.endTransaction()}
        coverFile(id).delete() // Only the private thumbnail; never a content URI / original audio.
    }
    fun coverFile(id:String):File {
        require(id.matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}".toRegex()))
        return File(File(context.filesDir,"library-covers").apply { mkdirs() }, "$id.jpg")
    }
    fun playerDetails(queueId:String,uri:String?,artist:String,album:String):JSObject {
        val track=if(uri?.startsWith("content://")==true)get(LibraryRules.id(uri)) else null
        return JSObject().apply {
            put("id",queueId);put("artist",track?.artist ?: artist);put("album",track?.album ?: album)
            put("libraryId",track?.id ?: org.json.JSONObject.NULL);put("favorite",track?.favorite ?: org.json.JSONObject.NULL)
            put("cover",if(track==null)org.json.JSONObject.NULL else coverData(track.id) ?: org.json.JSONObject.NULL)
        }
    }
    fun coverData(id:String):String? {
        val file=coverFile(id)
        return if(file.isFile && file.length()<=150000) "data:image/jpeg;base64,"+Base64.encodeToString(file.readBytes(),Base64.NO_WRAP) else null
    }
    fun page(query:String,artist:String,album:String,requestedPage:Int,favoritesOnly:Boolean=false,sort:String="title"):JSObject {
        val db=readableDatabase
        val ordering=when(sort){"title"->"title COLLATE NOCASE,id";"artist"->"artist COLLATE NOCASE,title COLLATE NOCASE,id";"album"->"album COLLATE NOCASE,year,title COLLATE NOCASE,id";"recent"->"COALESCE((SELECT position FROM track_additions WHERE track_id=tracks.id),0) DESC,title COLLATE NOCASE,id";else->throw IllegalArgumentException("Invalid sort")}
        val where=mutableListOf("search_text LIKE ? ESCAPE '\\'")
        val args=mutableListOf(LibraryRules.like(query.take(512)))
        if(favoritesOnly)where.add("favorite=1")
        if(artist.isNotEmpty()){where.add("(artist=? OR album_artist=?)");args.add(artist);args.add(artist)}
        if(album.isNotEmpty()){where.add("album_key=?");args.add(album)}
        val clause=where.joinToString(" AND ");val bindings=args.toTypedArray()
        val total=db.rawQuery("SELECT COUNT(*) FROM tracks WHERE $clause",bindings).use { it.moveToFirst();it.getInt(0) }
        val page=requestedPage.coerceIn(0,((total-1).coerceAtLeast(0))/50)
        val items=JSArray()
        db.query("tracks",arrayOf("id","title","artist","album","year","duration","favorite"),clause,bindings,null,null,ordering,"${page*50},50").use { c ->
            while(c.moveToNext())items.put(card(c))
        }
        val artists=JSArray();db.rawQuery("SELECT artist FROM tracks UNION SELECT album_artist AS artist FROM tracks ORDER BY artist COLLATE NOCASE",null).use { c -> while(c.moveToNext())artists.put(c.getString(0)) }
        val albums=JSArray();db.rawQuery("SELECT album_key,album,album_artist,year FROM tracks"+(if(artist.isEmpty()) "" else " WHERE (artist=? OR album_artist=?)")+" GROUP BY album_key ORDER BY album COLLATE NOCASE",if(artist.isEmpty())null else arrayOf(artist,artist)).use { c ->
            while(c.moveToNext()) albums.put(JSObject().apply {put("id",c.getString(0));put("label",listOf(c.getString(1),c.getString(2),c.getString(3)).filter { it.isNotEmpty() }.joinToString(" · "))})
        }
        return JSObject().apply {put("items",items);put("total",total);put("page",page);put("pageSize",50);put("artists",artists);put("albums",albums)}
    }
    private fun addedIds(db:SQLiteDatabase):List<String> = db.rawQuery("SELECT track_id FROM track_additions ORDER BY position",null).use {c->buildList {while(c.moveToNext())add(c.getString(0))}}
    private fun card(c:Cursor)=JSObject().apply {
        put("id",c.getString(0));put("title",c.getString(1));put("artist",c.getString(2));put("album",c.getString(3))
        put("year",c.getString(4));put("duration",c.getLong(5));put("favorite",c.getInt(6)==1);put("cover",coverData(c.getString(0)) ?: org.json.JSONObject.NULL)
    }
    fun home():JSObject {
        val db=readableDatabase;db.beginTransaction()
        try {
            fun count(table:String,where:String="")=db.rawQuery("SELECT COUNT(*) FROM $table$where",null).use {it.moveToFirst();it.getInt(0)}
            val recent=JSArray();db.rawQuery("SELECT t.id,t.title,t.artist,t.album,t.year,t.duration,t.favorite FROM tracks t JOIN track_additions a ON a.track_id=t.id ORDER BY a.position DESC LIMIT 6",null).use {c->while(c.moveToNext())recent.put(card(c))}
            val favorites=JSArray();db.query("tracks",arrayOf("id","title","artist","album","year","duration","favorite"),"favorite=1",null,null,null,"title COLLATE NOCASE,id","6").use {c->while(c.moveToNext())favorites.put(card(c))}
            return JSObject().apply {put("total",count("tracks"));put("favoriteTotal",count("tracks"," WHERE favorite=1"));put("recentTotal",count("track_additions"));put("recent",recent);put("favorites",favorites)}
        } finally {db.endTransaction()}
    }

}
