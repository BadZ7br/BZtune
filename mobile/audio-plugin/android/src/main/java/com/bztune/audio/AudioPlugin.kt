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
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg class ChooseArgs { var append: Boolean = false }
@InvokeArg class IndexArgs { var index: Int = -1; var id: String = ""; var to: Int = -1 }
@InvokeArg class SeekArgs { var position: Long = 0 }

@TauriPlugin
class AudioPlugin(private val activity: Activity) : Plugin(activity) {
    private val loader = java.util.concurrent.Executors.newSingleThreadExecutor()
    private val controllerDelegate = lazy {
        MediaController.Builder(activity, SessionToken(activity, ComponentName(activity, PlaybackService::class.java))).buildAsync()
    }
    private val controller by controllerDelegate
    override fun onDestroy(activity: androidx.appcompat.app.AppCompatActivity) {
        if (controllerDelegate.isInitialized()) MediaController.releaseFuture(controller)
        loader.shutdownNow()
        super.onDestroy(activity)
    }
    private fun withPlayer(invoke: Invoke, action: (MediaController) -> Unit) {
        activity.runOnUiThread {
            if (activity.isDestroyed) { invoke.reject("A tela foi encerrada."); return@runOnUiThread }
            controller.addListener({
                try { action(controller.get()) }
                catch (_: Exception) { invoke.reject("Não foi possível acessar o player. Tente abrir o arquivo novamente.") }
            }, ContextCompat.getMainExecutor(activity))
        }
    }

    private fun state(player: Player): JSObject = JSObject().apply {
        put("title", player.mediaMetadata.title?.toString() ?: "Nenhuma música selecionada")
        put("hasTrack", player.mediaItemCount > 0)
        put("playing", player.isPlaying)
        put("loading", player.playbackState == Player.STATE_BUFFERING)
        put("position", player.currentPosition.coerceAtLeast(0))
        put("duration", player.duration.coerceAtLeast(0))
        put("failed", player.playerError != null)
        put("index", if (player.mediaItemCount == 0) -1 else player.currentMediaItemIndex)
        put("shuffle", player.shuffleModeEnabled); put("repeat", player.repeatMode)
        put("canNext", player.hasNextMediaItem()); put("canPrevious", player.hasPreviousMediaItem())
        put("queue", JSArray().apply { for (i in 0 until player.mediaItemCount) {
            val item = player.getMediaItemAt(i)
            put(JSObject().apply { put("id", item.mediaId); put("title", item.mediaMetadata.title?.toString() ?: "Áudio local") })
        } })
    }
    @Command fun choose(invoke: Invoke) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
            type = "audio/*"; addCategory(Intent.CATEGORY_OPENABLE)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        }
        try { startActivityForResult(invoke, intent, "audioChosen") }
        catch (_: Exception) { invoke.reject("Seletor de áudio indisponível neste aparelho.") }
    }
    @ActivityCallback fun audioChosen(invoke: Invoke, result: ActivityResult) {
        if (result.resultCode != Activity.RESULT_OK) {
            invoke.resolve(JSObject().apply { put("cancelled", true) }); return
        }
        val uris = mutableListOf<Uri>()
        result.data?.clipData?.let { clip -> for (i in 0 until clip.itemCount) uris.add(clip.getItemAt(i).uri) }
        if (uris.isEmpty()) result.data?.data?.let { uris.add(it) }
        val selection = uris.distinct()
        if (selection.isEmpty() || selection.size > QueueStore.LIMIT || selection.any { it.scheme != "content" }) {
            invoke.reject("Selecione de 1 a 200 arquivos de áudio locais."); return
        }
        val append = invoke.parseArgs(ChooseArgs::class.java).append
        loader.execute {
            val acquired = mutableListOf<Uri>()
            try {
                val existing = activity.contentResolver.persistedUriPermissions.map { it.uri }.toSet()
                val items = selection.map { uri ->
                    activity.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    if (uri !in existing) acquired.add(uri)
                    var title = "Áudio local"
                    activity.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use {
                        if (it.moveToFirst()) title = it.getString(0) ?: title
                    }
                    MediaItem.Builder().setMediaId(java.util.UUID.randomUUID().toString()).setUri(uri)
                        .setMediaMetadata(MediaMetadata.Builder().setTitle(title).build()).build()
                }
                withPlayer(invoke) { player ->
                    if (append && player.mediaItemCount + items.size > QueueStore.LIMIT) {
                        acquired.forEach { release(it) }; invoke.reject("A fila desta versão de teste aceita até 200 músicas.")
                    } else {
                        if (append && player.mediaItemCount > 0) player.addMediaItems(items)
                        else { player.pause(); player.setMediaItems(items); player.prepare() }
                        invoke.resolve(state(player))
                    }
                }
            } catch (_: Exception) {
                acquired.forEach { release(it) }
                invoke.reject("Não foi possível acessar todos os arquivos. A fila foi preservada; selecione arquivos locais novamente.")
            }
        }
    }
    private fun release(uri: Uri) {
        try { activity.contentResolver.releasePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION) } catch (_: Exception) { }
    }
    @Command fun next(invoke: Invoke) = withPlayer(invoke) { it.seekToNextMediaItem(); invoke.resolve(state(it)) }
    @Command fun previous(invoke: Invoke) = withPlayer(invoke) { it.seekToPrevious(); invoke.resolve(state(it)) }
    @Command fun shuffle(invoke: Invoke) = withPlayer(invoke) { it.shuffleModeEnabled = !it.shuffleModeEnabled; invoke.resolve(state(it)) }
    @Command fun repeat(invoke: Invoke) = withPlayer(invoke) { it.repeatMode = when(it.repeatMode) { Player.REPEAT_MODE_OFF -> Player.REPEAT_MODE_ALL; Player.REPEAT_MODE_ALL -> Player.REPEAT_MODE_ONE; else -> Player.REPEAT_MODE_OFF }; invoke.resolve(state(it)) }
    @Command fun jump(invoke: Invoke) {
        val args = invoke.parseArgs(IndexArgs::class.java)
        withPlayer(invoke) { if (args.index !in 0 until it.mediaItemCount || it.getMediaItemAt(args.index).mediaId != args.id) invoke.reject("A fila mudou. Tente novamente.") else { it.seekToDefaultPosition(args.index); invoke.resolve(state(it)) } }
    }
    @Command fun remove(invoke: Invoke) {
        val args = invoke.parseArgs(IndexArgs::class.java)
        withPlayer(invoke) { if (args.index !in 0 until it.mediaItemCount || it.getMediaItemAt(args.index).mediaId != args.id) invoke.reject("A fila mudou. Tente novamente.") else { it.removeMediaItem(args.index); invoke.resolve(state(it)) } }
    }
    @Command fun reorder(invoke: Invoke) {
        val args = invoke.parseArgs(IndexArgs::class.java)
        withPlayer(invoke) { if (args.index !in 0 until it.mediaItemCount || it.getMediaItemAt(args.index).mediaId != args.id || args.to !in 0 until it.mediaItemCount) invoke.reject("A fila mudou. Tente novamente.") else { it.moveMediaItem(args.index, args.to); invoke.resolve(state(it)) } }
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
