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
        val savedUri = preferences.getString("uri", null)
        if (savedUri != null && Uri.parse(savedUri).scheme == "content") {
            val metadata = MediaMetadata.Builder().setTitle(preferences.getString("title", "Áudio local")).build()
            player.setMediaItem(MediaItem.Builder().setUri(savedUri).setMediaMetadata(metadata).build())
            player.seekTo(preferences.getLong("position", 0))
            player.prepare() // Restore paused, never start audio automatically.
        }
        player.addListener(object : Player.Listener {
            override fun onEvents(player: Player, events: Player.Events) { saveState() }
        })
    }
    private fun saveState() {
        val player = session?.player ?: return
        val uri = player.currentMediaItem?.localConfiguration?.uri ?: return
        preferences.edit().putString("uri", uri.toString())
            .putString("title", player.mediaMetadata.title?.toString() ?: "Áudio local")
            .putLong("position", player.currentPosition.coerceAtLeast(0)).apply()
    }
    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session
    override fun onTaskRemoved(rootIntent: Intent?) {
        saveState()
        if (session?.player?.playWhenReady != true) stopSelf()
    }
    override fun onDestroy() {
        saveState()
        session?.let { it.player.release(); it.release() }
        session = null
        super.onDestroy()
    }
}
