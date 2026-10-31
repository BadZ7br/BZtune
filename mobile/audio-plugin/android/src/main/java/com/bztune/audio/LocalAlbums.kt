package com.bztune.audio

import android.content.ContentValues
import android.database.sqlite.SQLiteDatabase
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import java.util.Locale

internal data class SavedAlbum(val id:String,val title:String,val artist:String,val year:String,val favorite:Boolean,val collected:Boolean)
internal class AlbumFailure(val code:String):Exception(code)
internal class LocalAlbums(private val library:LocalLibrary) {
    companion object {
        const val LIMIT=2000
        fun create(db:SQLiteDatabase) {db.execSQL("CREATE TABLE album_marks(id TEXT PRIMARY KEY,title TEXT NOT NULL,artist TEXT NOT NULL,year TEXT NOT NULL,favorite INTEGER NOT NULL CHECK(favorite IN (0,1)),collected INTEGER NOT NULL CHECK(collected IN (0,1)))")}
    }
    private val db get()=library.writableDatabase
    fun saved():List<SavedAlbum> = db.rawQuery("SELECT id,title,artist,year,favorite,collected FROM album_marks ORDER BY id",null).use {c->buildList {while(c.moveToNext())add(SavedAlbum(c.getString(0),c.getString(1),c.getString(2),c.getString(3),c.getInt(4)==1,c.getInt(5)==1))}}
    fun restore(albums:List<SavedAlbum>) {db.delete("album_marks",null,null);albums.forEach {write(it)}}
    private fun write(a:SavedAlbum) {db.insertOrThrow("album_marks",null,ContentValues().apply {put("id",a.id);put("title",a.title);put("artist",a.artist);put("year",a.year);put("favorite",if(a.favorite)1 else 0);put("collected",if(a.collected)1 else 0)})}
    private fun catalog():List<Pair<SavedAlbum,Int>> {
        val marks=saved().associateBy {it.id};val found=mutableSetOf<String>()
        val result=mutableListOf<Pair<SavedAlbum,Int>>()
        db.rawQuery("SELECT album_key,album,album_artist,year,COUNT(*) FROM tracks GROUP BY album_key",null).use {c->while(c.moveToNext()) {
            val id=c.getString(0);found.add(id)
            result.add(SavedAlbum(id,c.getString(1),c.getString(2),c.getString(3),marks[id]?.favorite?:false,marks[id]?.collected?:false) to c.getInt(4))
        }}
        marks.values.filter {it.id !in found}.forEach {result.add(it to 0)}
        return result.sortedWith(compareBy({it.first.title.lowercase(Locale.ROOT)},{it.first.year},{it.first.id}))
    }
    fun snapshot(query:String,artist:String,filter:String,page:Int):JSObject {
        if(filter !in listOf("all","favorites","collection"))throw AlbumFailure("ALBUM_INVALID")
        db.beginTransaction()
        try {
            val catalog=catalog();val search=LibraryRules.search(query.take(512))
            val filtered=catalog.filter {(a,_)->
                (artist.isEmpty()||a.artist==artist)&&(filter!="favorites"||a.favorite)&&(filter!="collection"||a.collected)&&LibraryRules.search("${a.title} ${a.artist} ${a.year}").contains(search)
            }
            val current=page.coerceIn(0,(filtered.size-1).coerceAtLeast(0)/50)
            val items=JSArray();filtered.drop(current*50).take(50).forEach {(a,count)->items.put(JSObject().apply {put("id",a.id);put("title",a.title);put("artist",a.artist);put("year",a.year);put("favorite",a.favorite);put("collected",a.collected);put("count",count)})}
            return JSObject().apply {put("items",items);put("total",filtered.size);put("page",current);put("pageSize",50);put("artists",JSArray().apply {catalog.map {it.first.artist}.distinct().sorted().forEach {put(it)}})}
        } finally {db.endTransaction()}
    }
    fun mark(id:String,favorite:Boolean,collected:Boolean,expectedFavorite:Boolean,expectedCollected:Boolean) {
        db.beginTransaction()
        try {
            val existing=catalog().find {it.first.id==id}?.first ?: throw AlbumFailure("ALBUM_CHANGED")
            if(existing.favorite!=expectedFavorite||existing.collected!=expectedCollected)throw AlbumFailure("ALBUM_CHANGED")
            if((favorite||collected)&&saved().none {it.id==id}&&saved().size>=LIMIT)throw AlbumFailure("ALBUM_LIMIT")
            db.delete("album_marks","id=?",arrayOf(id))
            if(favorite||collected)write(existing.copy(favorite=favorite,collected=collected))
            db.setTransactionSuccessful()
        } finally {db.endTransaction()}
    }
}
