package com.bztune.audio

import android.content.Intent
import android.net.Uri
import android.os.Process
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService

class PlaybackService : MediaSessionService() {
    private val handler = android.os.Handler(android.os.Looper.getMainLooper())
    private var restoreFailed = false
    private var lastSaved: String? = null
    private val saveProgress = object : Runnable {
        override fun run() {
            if (session?.player?.isPlaying == true) saveState()
            handler.postDelayed(this, 5000)
        }
    }
    private var session: MediaSession? = null
    private val preferences by lazy { getSharedPreferences("local-player-v1", MODE_PRIVATE) }

    override fun onCreate() {
        super.onCreate()
        val player = ExoPlayer.Builder(this).build().apply {
            setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), true)
            setHandleAudioBecomingNoisy(true)
            setWakeMode(C.WAKE_MODE_LOCAL)
        }
        session = MediaSession.Builder(this, player).setCallback(object : MediaSession.Callback {
            override fun onConnect(session: MediaSession, controller: MediaSession.ControllerInfo): MediaSession.ConnectionResult {
                return if (controller.uid == Process.myUid() || controller.isTrusted)
                    super.onConnect(session, controller) else MediaSession.ConnectionResult.reject()
            }
        }).build()
        val raw = preferences.getString("queue", null)
        try {
            val saved = if (raw != null) QueueStore.decode(raw) else {
                val uri = preferences.getString("uri", null)
                if (uri != null && Uri.parse(uri).scheme == "content") SavedQueue(listOf(SavedTrack(java.util.UUID.randomUUID().toString(), uri, preferences.getString("title", "Áudio local") ?: "Áudio local")), 0, preferences.getLong("position", 0).coerceAtLeast(0), false, 0) else null
            }
            if (saved != null) {
                player.shuffleModeEnabled = saved.shuffle; player.repeatMode = saved.repeat
            }
            if (saved != null && saved.tracks.isNotEmpty()) {
                player.setMediaItems(saved.tracks.map { track ->
                    MediaItem.Builder().setMediaId(track.id).setUri(track.uri)
                        .setMediaMetadata(MediaMetadata.Builder().setTitle(track.title).setArtist(track.artist).setAlbumTitle(track.album).build()).build()
                }, saved.index, saved.position)
                player.prepare() // Restore paused, never start audio automatically.
            }
        } catch (_: Exception) {
            restoreFailed = true
            // Preserve malformed storage until the user chooses new audio.
        }
        handler.postDelayed(saveProgress, 5000)
        player.addListener(object : Player.Listener {
            override fun onEvents(player: Player, events: Player.Events) { saveState() }
        })
    }
    private fun saveState() {
        val player = session?.player ?: return
        if (restoreFailed && player.mediaItemCount == 0) return
        restoreFailed = false
        val tracks = (0 until player.mediaItemCount).map { i ->
            val item = player.getMediaItemAt(i)
            SavedTrack(item.mediaId, item.localConfiguration?.uri?.toString() ?: return, item.mediaMetadata.title?.toString() ?: "Áudio local", item.mediaMetadata.artist?.toString() ?: "", item.mediaMetadata.albumTitle?.toString() ?: "")
        }
        val raw = QueueStore.encode(SavedQueue(tracks, if (tracks.isEmpty()) -1 else player.currentMediaItemIndex,
            player.currentPosition.coerceAtLeast(0), player.shuffleModeEnabled, player.repeatMode))
        if (raw != lastSaved) {
            preferences.edit().putString("queue", raw).remove("uri").remove("title").remove("position").apply()
            lastSaved = raw
        }
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session
    override fun onTaskRemoved(rootIntent: Intent?) {
        saveState()
        if (session?.player?.playWhenReady != true) stopSelf()
    }
    override fun onDestroy() {
        handler.removeCallbacks(saveProgress)
        saveState()
        session?.let { it.player.release(); it.release() }
        session = null
        super.onDestroy()
    }
}
