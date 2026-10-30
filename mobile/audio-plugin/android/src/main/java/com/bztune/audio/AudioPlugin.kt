package com.bztune.audio

import android.app.Activity
import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.result.ActivityResult
import androidx.core.content.ContextCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg class SeekArgs { var position: Long = 0 }

@TauriPlugin
class AudioPlugin(private val activity: Activity) : Plugin(activity) {
    private val controllerDelegate = lazy {
        MediaController.Builder(activity, SessionToken(activity, ComponentName(activity, PlaybackService::class.java))).buildAsync()
    }
    private val controller by controllerDelegate
    override fun onDestroy(activity: androidx.appcompat.app.AppCompatActivity) {
        if (controllerDelegate.isInitialized()) MediaController.releaseFuture(controller)
        super.onDestroy(activity)
    }
    private fun withPlayer(invoke: Invoke, action: (MediaController) -> Unit) {
        controller.addListener({
            try { action(controller.get()) }
            catch (_: Exception) { invoke.reject("Não foi possível acessar o player. Tente abrir o arquivo novamente.") }
        }, ContextCompat.getMainExecutor(activity))
    }
    private fun state(player: Player): JSObject = JSObject().apply {
        put("title", player.mediaMetadata.title?.toString() ?: "Nenhuma música selecionada")
        put("hasTrack", player.mediaItemCount > 0)
        put("playing", player.isPlaying)
        put("loading", player.playbackState == Player.STATE_BUFFERING)
        put("position", player.currentPosition.coerceAtLeast(0))
        put("duration", player.duration.coerceAtLeast(0))
        put("failed", player.playerError != null)
    }
    @Command fun choose(invoke: Invoke) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            type = "audio/*"; addCategory(Intent.CATEGORY_OPENABLE)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        }
        try { startActivityForResult(invoke, intent, "audioChosen") }
        catch (_: Exception) { invoke.reject("Seletor de áudio indisponível neste aparelho.") }
    }
    @ActivityCallback fun audioChosen(invoke: Invoke, result: ActivityResult) {
        val uri: Uri? = result.data?.data
        if (result.resultCode != Activity.RESULT_OK || uri == null) {
            invoke.resolve(JSObject().apply { put("cancelled", true) }); return
        }
        if (uri.scheme != "content") { invoke.reject("Selecione um arquivo pelo armazenamento Android."); return }
        try {
            activity.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            var title = "Áudio local"
            activity.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use {
                if (it.moveToFirst()) title = it.getString(0) ?: title
            }
            withPlayer(invoke) { player ->
                player.setMediaItem(MediaItem.Builder().setUri(uri).setMediaMetadata(MediaMetadata.Builder().setTitle(title).build()).build())
                player.prepare() // User starts playback explicitly with Play.
                invoke.resolve(state(player))
            }
        } catch (_: Exception) { invoke.reject("Não foi possível obter acesso persistente ao arquivo. Escolha outro arquivo local.") }
    }
    @Command fun snapshot(invoke: Invoke) = withPlayer(invoke) { invoke.resolve(state(it)) }
    @Command fun play(invoke: Invoke) = withPlayer(invoke) {
        if (it.mediaItemCount == 0) { invoke.reject("Escolha uma música primeiro."); return@withPlayer }
        if (it.playerError != null || it.playbackState == Player.STATE_IDLE) it.prepare()
        if (it.playbackState == Player.STATE_ENDED) it.seekTo(0)
        it.play(); invoke.resolve(state(it))
    }
    @Command fun pause(invoke: Invoke) = withPlayer(invoke) { it.pause(); invoke.resolve(state(it)) }
    @Command fun stop(invoke: Invoke) = withPlayer(invoke) { it.pause(); it.seekTo(0); invoke.resolve(state(it)) }
    @Command fun seek(invoke: Invoke) {
        val args = invoke.parseArgs(SeekArgs::class.java)
        withPlayer(invoke) { it.seekTo(args.position.coerceIn(0, it.duration.coerceAtLeast(0))); invoke.resolve(state(it)) }
    }
}
