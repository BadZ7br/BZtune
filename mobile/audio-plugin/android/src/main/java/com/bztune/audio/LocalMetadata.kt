package com.bztune.audio

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.provider.OpenableColumns

internal object LocalMetadata {
    fun read(context:Context,uri:Uri,library:LocalLibrary):LibraryTrack {
        // Fail before changing the catalog if the provider no longer permits access.
        context.contentResolver.openAssetFileDescriptor(uri,"r")?.use { } ?: error("Arquivo indisponível")
        var name="Áudio local"
        context.contentResolver.query(uri,arrayOf(OpenableColumns.DISPLAY_NAME),null,null,null)?.use { if(it.moveToFirst())name=it.getString(0) ?: name }
        val id=LibraryRules.id(uri.toString());val reader=MediaMetadataRetriever()
        var title=name;var artist="Artista desconhecido";var album="Álbum desconhecido";var albumArtist=artist;var year="";var duration=0L
        try {
            reader.setDataSource(context,uri)
            fun tag(key:Int)=reader.extractMetadata(key)?.trim()?.takeIf { it.isNotEmpty() }
            title=tag(MediaMetadataRetriever.METADATA_KEY_TITLE) ?: name
            artist=tag(MediaMetadataRetriever.METADATA_KEY_ARTIST) ?: artist
            album=tag(MediaMetadataRetriever.METADATA_KEY_ALBUM) ?: album
            albumArtist=tag(MediaMetadataRetriever.METADATA_KEY_ALBUMARTIST) ?: artist
            year=tag(MediaMetadataRetriever.METADATA_KEY_YEAR)?.take(4)?.takeIf { it.matches("[0-9]{4}".toRegex()) } ?: ""
            duration=tag(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()?.coerceAtLeast(0) ?: 0
            reader.embeddedPicture?.let { picture ->
                if(picture.size<=8*1024*1024) {
                    val options=BitmapFactory.Options().apply {inJustDecodeBounds=true}
                    BitmapFactory.decodeByteArray(picture,0,picture.size,options)
                    if(options.outWidth>0 && options.outHeight>0) {
                        options.inJustDecodeBounds=false;options.inSampleSize=1
                        while(options.outWidth/options.inSampleSize>256 || options.outHeight/options.inSampleSize>256)options.inSampleSize*=2
                        BitmapFactory.decodeByteArray(picture,0,picture.size,options)?.let { bitmap ->
                            try {library.coverFile(id).outputStream().use { bitmap.compress(Bitmap.CompressFormat.JPEG,75,it) }} finally {bitmap.recycle()}
                        }
                    }
                }
            }
        } catch (_: Exception) { /* Untagged/unsupported metadata: keep filename and available tags. */ }
        finally {try {reader.release()} catch (_: Exception) { }}
        return LibraryTrack(id,uri.toString(),title,artist,album,albumArtist,year,duration)
    }
}
