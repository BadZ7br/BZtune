package com.bztune.audio

import org.json.JSONArray
import org.json.JSONObject

internal data class SavedTrack(val id: String, val uri: String, val title: String, val artist: String = "", val album: String = "")
internal data class SavedQueue(val tracks: List<SavedTrack>, val index: Int, val position: Long, val shuffle: Boolean, val repeat: Int)
internal object QueueStore {
    const val LIMIT = 200
    fun encode(queue: SavedQueue): String = JSONObject().apply {
        put("version", 1); put("index", queue.index); put("position", queue.position)
        put("shuffle", queue.shuffle); put("repeat", queue.repeat)
        put("tracks", JSONArray().apply { queue.tracks.forEach { track ->
            put(JSONObject().put("id", track.id).put("uri", track.uri).put("title", track.title).put("artist",track.artist).put("album",track.album))
        } })
    }.toString()
    fun decode(raw: String): SavedQueue {
        require(raw.length <= 2_000_000)
        val root = JSONObject(raw); require(root.get("version") is Int && root.getInt("version") == 1)
        val items = root.getJSONArray("tracks"); require(items.length() <= LIMIT)
        val tracks = (0 until items.length()).map {
            val row = items.getJSONObject(it)
            SavedTrack(row.getString("id"), row.getString("uri"), row.getString("title"), if(row.has("artist")) row.getString("artist") else "", if(row.has("album")) row.getString("album") else "").also { track ->
                require(track.id.isNotEmpty() && track.uri.startsWith("content://") && track.uri.length > 10)
            }
        }
        require(tracks.map { it.id }.distinct().size == tracks.size)
        require(root.get("index") is Int && root.get("repeat") is Int && root.get("shuffle") is Boolean)
        require(root.get("position") is Int || root.get("position") is Long)
        val index = root.getInt("index"); require(if (tracks.isEmpty()) index == -1 else index in tracks.indices)
        val position = root.getLong("position"); require(position >= 0)
        val repeat = root.getInt("repeat"); require(repeat in 0..2)
        return SavedQueue(tracks, index, position, root.getBoolean("shuffle"), repeat)
    }
}
