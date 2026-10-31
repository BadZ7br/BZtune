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
    companion object {
        private var active:PlaybackService?=null
        fun currentPlayer():Player?=active?.session?.player
        fun flush() {active?.saveState()}
        fun beginRestore() {active?.saveState();active?.applyingRestore=true}
        fun abortRestore() {active?.applyingRestore=false;active?.saveState()}
        fun applyPending():Player? {
            val service=active ?: return null
            try {service.reloadPending()}
            catch(error:Exception) {
                // Keep the committed journal intact until the next service startup.
                service.pendingUnapplied=true
                throw error
            }
            return service.session?.player
        }
    }
    private var pendingUnapplied=false
    private var applyingRestore=false
    private var restorePending=false
    private val handler = android.os.Handler(android.os.Looper.getMainLooper())
    private var restoreFailed = false
    private var lastSaved: String? = null
    private val saveProgress = object : Runnable {
        override fun run() {
            if (session?.player?.isPlaying == true || restorePending) saveState()
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
        active=this
        var pending:String?=null
        try {
            pending=LocalLibrary(applicationContext).use {it.pendingQueue()}
            if(pending!=null) {
                QueueStore.decode(pending)
                restorePending=true
                if(preferences.edit().putString("queue",pending).remove("uri").remove("title").remove("position").commit()) {
                    LocalLibrary(applicationContext).use {it.clearPending(pending)};restorePending=false
                }
            }
        } catch (_:Exception) {restoreFailed=true;pending=null}
        val raw = pending ?: preferences.getString("queue", null)
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
        if(applyingRestore || pendingUnapplied)return
        val player = session?.player ?: return
        if (restoreFailed && player.mediaItemCount == 0) return
        restoreFailed = false
        val tracks = (0 until player.mediaItemCount).map { i ->
            val item = player.getMediaItemAt(i)
            SavedTrack(item.mediaId, item.localConfiguration?.uri?.toString() ?: return, item.mediaMetadata.title?.toString() ?: "Áudio local", item.mediaMetadata.artist?.toString() ?: "", item.mediaMetadata.albumTitle?.toString() ?: "")
        }
        val raw = QueueStore.encode(SavedQueue(tracks, if (tracks.isEmpty()) -1 else player.currentMediaItemIndex,
            player.currentPosition.coerceAtLeast(0), player.shuffleModeEnabled, player.repeatMode))
        if(restorePending) {
            LocalLibrary(applicationContext).use {it.updatePending(raw)}
            if(preferences.edit().putString("queue",raw).commit()) {
                LocalLibrary(applicationContext).use {it.clearPending(raw)};restorePending=false
            }
        }
        if (raw != lastSaved) {
            preferences.edit().putString("queue", raw).remove("uri").remove("title").remove("position").apply()
            lastSaved = raw
        }
    }

    private fun reloadPending() {
        val raw=LocalLibrary(applicationContext).use {it.pendingQueue()} ?: return
        val saved=QueueStore.decode(raw);val player=session?.player ?: return
        restorePending=true;restoreFailed=false;lastSaved=null
        applyingRestore=true
        try {
        player.pause()
        if(saved.tracks.isEmpty()) {player.stop();player.clearMediaItems()}
        else {
            player.setMediaItems(saved.tracks.map {MediaItem.Builder().setMediaId(it.id).setUri(it.uri).setMediaMetadata(MediaMetadata.Builder().setTitle(it.title).setArtist(it.artist).setAlbumTitle(it.album).build()).build()},saved.index,saved.position)
            player.prepare()
        }
        player.shuffleModeEnabled=saved.shuffle;player.repeatMode=saved.repeat
        pendingUnapplied=false
        } finally {applyingRestore=false}
        saveState()
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
        if(active===this)active=null
        super.onDestroy()
    }
}
