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

@InvokeArg class ChooseArgs { var append: Boolean = false; var library: Boolean = false }
@InvokeArg class IndexArgs { var index: Int = -1; var id: String = ""; var to: Int = -1 }
@InvokeArg class LibraryArgs { var id: String = ""; var query: String = ""; var artist: String = ""; var album: String = ""; var page: Int = 0; var favoritesOnly: Boolean = false }
@InvokeArg class PlaylistArgs {var action:String="list";var id:String="";var name:String="";var trackId:String="";var trackIds:Array<String> = emptyArray();var revision:Long=-1}
@InvokeArg class AlbumArgs {var action:String="list";var id:String="";var query:String="";var artist:String="";var filter:String="all";var page:Int=0;var favorite:Boolean=false;var collected:Boolean=false;var expectedFavorite:Boolean=false;var expectedCollected:Boolean=false}
@InvokeArg class FavoriteArgs {var id:String="";var favorite:Boolean=false}
@InvokeArg class ExportArgs {var previous:Boolean=false}
@InvokeArg class RestoreArgs {var token:String=""}
@InvokeArg class SeekArgs { var position: Long = 0 }

@TauriPlugin
class AudioPlugin(private val activity: Activity) : Plugin(activity) {
    @Volatile private var stagedBackup:Triple<String,Long,AndroidBackup>?=null
    private val restoring=java.util.concurrent.atomic.AtomicBoolean(false)
    private val backupLoader=java.util.concurrent.Executors.newSingleThreadExecutor()
    private val playlistLoader=java.util.concurrent.Executors.newSingleThreadExecutor()
    private val importLoader = java.util.concurrent.Executors.newSingleThreadExecutor()
    private val loader = java.util.concurrent.Executors.newSingleThreadExecutor()
    private val controllerDelegate = lazy {
        MediaController.Builder(activity, SessionToken(activity, ComponentName(activity, PlaybackService::class.java))).buildAsync()
    }
    private val controller by controllerDelegate
    override fun onDestroy(activity: androidx.appcompat.app.AppCompatActivity) {
        if (controllerDelegate.isInitialized()) MediaController.releaseFuture(controller)
        stagedBackup=null
        loader.shutdownNow()
        importLoader.shutdownNow()
        playlistLoader.shutdownNow()
        backupLoader.shutdown()
        super.onDestroy(activity)
    }
    private fun withPlayer(invoke: Invoke, failure: () -> Unit = {}, action: (MediaController) -> Unit) {
        activity.runOnUiThread {
            if (activity.isDestroyed) { failure(); invoke.reject("A tela foi encerrada."); return@runOnUiThread }
            controller.addListener({
                try { action(controller.get()) }
                catch (_: Exception) { failure(); invoke.reject("Não foi possível acessar o player. Tente abrir o arquivo novamente.") }
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
        val options = invoke.parseArgs(ChooseArgs::class.java)
        if (options.library) { importSelection(invoke, selection); return }
        val append = options.append
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
    private fun importSelection(invoke: Invoke, selection: List<Uri>) {
        val finished = java.util.concurrent.atomic.AtomicBoolean(false)
        val handler = android.os.Handler(android.os.Looper.getMainLooper())
        val timeout = Runnable { if (finished.compareAndSet(false,true)) invoke.reject("A importação excedeu o prazo. Tente um lote menor de arquivos locais.","LIBRARY_IMPORT_TIMEOUT") }
        handler.postDelayed(timeout, 30000)
        importLoader.execute {
            val acquired = mutableListOf<Uri>(); var committed = false; var claimed = false
            try {
                val existing = activity.contentResolver.persistedUriPermissions.map { it.uri }.toSet()
                LocalLibrary(activity.applicationContext).use { library ->
                    val tracks = selection.map { uri ->
                        if (finished.get() || Thread.currentThread().isInterrupted) throw java.util.concurrent.CancellationException()
                        activity.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        if (uri !in existing) acquired.add(uri)
                        LocalMetadata.read(activity, uri, library)
                    }
                    if (!finished.compareAndSet(false,true)) return@use
                    claimed = true; handler.removeCallbacks(timeout)
                    library.save(tracks); committed = true
                    invoke.resolve(library.page("","","",0).apply { put("imported",tracks.size) })
                }
            } catch (_: Exception) {
                if (claimed || finished.compareAndSet(false,true)) invoke.reject("Não foi possível importar os arquivos. Verifique o acesso e tente novamente.","LIBRARY_IMPORT_FAILED")
            } finally {
                handler.removeCallbacks(timeout)
                if (!committed) acquired.forEach { release(it) }
            }
        }
    }
    @Command fun libraryList(invoke: Invoke) {
        val args=invoke.parseArgs(LibraryArgs::class.java)
        loader.execute { try { LocalLibrary(activity.applicationContext).use { invoke.resolve(it.page(args.query,args.artist,args.album,args.page,args.favoritesOnly)) } } catch (_: Exception) { invoke.reject("Não foi possível carregar a biblioteca. Tente novamente.","LIBRARY_LOAD_FAILED") } }
    }
    @Command fun libraryFavorite(invoke: Invoke) {
        val args=invoke.parseArgs(FavoriteArgs::class.java)
        loader.execute {try {
            LocalLibrary(activity.applicationContext).use {it.setFavorite(args.id,args.favorite)}
            invoke.resolve(JSObject().apply {put("updated",true)})
        } catch (_:Exception) {invoke.reject("Não foi possível atualizar o favorito. Recarregue a biblioteca e tente novamente.","LIBRARY_FAVORITE_FAILED")}}
    }
    @Command fun libraryForget(invoke: Invoke) {
        val args=invoke.parseArgs(LibraryArgs::class.java)
        loader.execute { try { LocalLibrary(activity.applicationContext).use { it.forget(args.id) };invoke.resolve(JSObject().apply {put("removed",true)}) } catch (_: Exception) { invoke.reject("Não foi possível remover o registro da biblioteca.","LIBRARY_REMOVE_FAILED") } }
    }
    private fun fromLibrary(invoke: Invoke, append:Boolean) {
        val args=invoke.parseArgs(LibraryArgs::class.java)
        loader.execute {
            try {
                val track=LocalLibrary(activity.applicationContext).use { it.get(args.id) } ?: error("Missing")
                activity.contentResolver.openAssetFileDescriptor(Uri.parse(track.uri),"r")?.use { } ?: error("Unavailable")
                val item=MediaItem.Builder().setMediaId(java.util.UUID.randomUUID().toString()).setUri(track.uri)
                    .setMediaMetadata(MediaMetadata.Builder().setTitle(track.title).setArtist(track.artist).setAlbumTitle(track.album).build()).build()
                withPlayer(invoke) { player ->
                    if (append && player.mediaItemCount>=QueueStore.LIMIT) { invoke.reject("A fila de teste aceita até 200 músicas.","QUEUE_LIMIT"); return@withPlayer }
                    if (append && player.mediaItemCount>0) player.addMediaItem(item)
                    else {player.pause();player.setMediaItem(item);player.prepare();if(!append)player.play()}
                    invoke.resolve(state(player))
                }
            } catch (_: Exception) { invoke.reject("Arquivo indisponível ou acesso revogado. Importe novamente pelo seletor Android.","LIBRARY_FILE_UNAVAILABLE") }
        }
    }
    @Command fun libraryPlay(invoke: Invoke) = fromLibrary(invoke,false)
    @Command fun libraryEnqueue(invoke: Invoke) = fromLibrary(invoke,true)
    @Command fun albums(invoke:Invoke) {
        val args=invoke.parseArgs(AlbumArgs::class.java)
        loader.execute {try {
            LocalLibrary(activity.applicationContext).use {library->
                val store=LocalAlbums(library)
                if(args.action=="mark")store.mark(args.id,args.favorite,args.collected,args.expectedFavorite,args.expectedCollected)
                else if(args.action!="list")throw AlbumFailure("ALBUM_INVALID")
                invoke.resolve(store.snapshot(args.query,args.artist,args.filter,args.page))
            }
        } catch(error:Exception) {invoke.reject("Não foi possível atualizar os álbuns. Recarregue e tente novamente.",if(error is AlbumFailure)error.code else "ALBUM_FAILED")}}
    }
    @Command fun playlists(invoke:Invoke) {
        val args=invoke.parseArgs(PlaylistArgs::class.java)
        loader.execute {try {
            LocalLibrary(activity.applicationContext).use {library->
                val store=LocalPlaylists(library)
                invoke.resolve(if(args.action=="list")store.snapshot(args.id) else store.edit(args.action,args.id,args.name,args.trackId,args.trackIds.toList(),args.revision))
            }
        } catch(error:Exception) {invoke.reject("Não foi possível atualizar as playlists. Recarregue e tente novamente.",if(error is PlaylistFailure)error.code else "PLAYLIST_FAILED")}}
    }
    private fun fromPlaylist(invoke:Invoke,append:Boolean) {
        val args=invoke.parseArgs(PlaylistArgs::class.java)
        val finished=java.util.concurrent.atomic.AtomicBoolean(false)
        val handler=android.os.Handler(android.os.Looper.getMainLooper())
        val timeout=Runnable {if(finished.compareAndSet(false,true))invoke.reject("A preparação da playlist excedeu o prazo. Confira o acesso aos arquivos.","PLAYLIST_TIMEOUT")}
        handler.postDelayed(timeout,30000)
        playlistLoader.execute {try {
            val tracks=LocalLibrary(activity.applicationContext).use {LocalPlaylists(it).tracks(args.id,args.revision)}
            if(tracks.isEmpty())throw PlaylistFailure("PLAYLIST_EMPTY")
            val items=tracks.map {t->
                if(finished.get()||Thread.currentThread().isInterrupted)throw java.util.concurrent.CancellationException()
                activity.contentResolver.openAssetFileDescriptor(Uri.parse(t.uri),"r")?.use {} ?: error("Unavailable")
                MediaItem.Builder().setMediaId(java.util.UUID.randomUUID().toString()).setUri(t.uri)
                    .setMediaMetadata(MediaMetadata.Builder().setTitle(t.title).setArtist(t.artist).setAlbumTitle(t.album).build()).build()
            }
            activity.runOnUiThread {
                if(finished.get())return@runOnUiThread
                controller.addListener({
                    if(finished.compareAndSet(false,true)) {
                        handler.removeCallbacks(timeout)
                        try {
                            check(!activity.isDestroyed)
                            val player=controller.get()
                            if(append&&player.mediaItemCount+items.size>QueueStore.LIMIT)invoke.reject("A fila de teste aceita até 200 músicas.","QUEUE_LIMIT")
                            else {
                                if(append&&player.mediaItemCount>0)player.addMediaItems(items)
                                else {player.pause();player.setMediaItems(items);player.prepare();if(!append)player.play()}
                                invoke.resolve(state(player))
                            }
                        } catch (_:Exception) {invoke.reject("Não foi possível preparar os arquivos. A fila anterior pode ser consultada ao reabrir o player.","PLAYLIST_FAILED")}
                    }
                },ContextCompat.getMainExecutor(activity))
            }
        } catch(error:Exception) {
            if(finished.compareAndSet(false,true))invoke.reject("Arquivo indisponível ou acesso revogado. Importe novamente pelo seletor Android.",if(error is PlaylistFailure)error.code else "LIBRARY_FILE_UNAVAILABLE")
            handler.removeCallbacks(timeout)
        }}
    }
    @Command fun playlistPlay(invoke:Invoke)=fromPlaylist(invoke,false)
    @Command fun playlistEnqueue(invoke:Invoke)=fromPlaylist(invoke,true)
    private fun emptyQueue()=QueueStore.encode(SavedQueue(emptyList(),-1,0,false,0))
    private fun queueRaw()=activity.getSharedPreferences("local-player-v1",android.content.Context.MODE_PRIVATE).getString("queue",null) ?: emptyQueue()
    @Command fun exportBackup(invoke:Invoke) {
        if(invoke.parseArgs(ExportArgs::class.java).previous && !java.io.File(activity.filesDir,"before-restore.json").isFile) {invoke.reject("Ainda não há cópia anterior de restauração.","BACKUP_PREVIOUS_MISSING");return}
        val intent=Intent(Intent.ACTION_CREATE_DOCUMENT).apply {type="application/json";addCategory(Intent.CATEGORY_OPENABLE);putExtra(Intent.EXTRA_TITLE,"BZtune-Backup-Android.json")}
        try {startActivityForResult(invoke,intent,"backupDestination")} catch (_:Exception) {invoke.reject("Não foi possível abrir o destino do backup.")}
    }
    @ActivityCallback fun backupDestination(invoke:Invoke,result:ActivityResult) {
        val uri=result.data?.data
        if(result.resultCode!=Activity.RESULT_OK||uri==null){invoke.resolve(JSObject().apply{put("cancelled",true)});return}
        withPlayer(invoke) {
            PlaybackService.flush();val queue=queueRaw()
            backupLoader.execute {try {
                val raw=if(invoke.parseArgs(ExportArgs::class.java).previous) {
                    val previous=java.io.File(activity.filesDir,"before-restore.json")
                    require(previous.isFile)
                    previous.inputStream().use {BackupStore.encode(BackupStore.read(it))}
                } else LocalLibrary(activity.applicationContext).use {BackupStore.encode(it.backup(queue))}
                activity.contentResolver.openOutputStream(uri,"wt")?.use {it.write(raw.toByteArray(Charsets.UTF_8))} ?: error("Destino indisponível")
                invoke.resolve(JSObject().apply {put("exported",true)})
            } catch (_:Exception) {invoke.reject("Não foi possível concluir o backup. Descarte o arquivo incompleto e tente novamente.","BACKUP_EXPORT_FAILED")}}
        }
    }
    @Command fun stageBackup(invoke:Invoke) {
        stagedBackup=null
        val intent=Intent(Intent.ACTION_OPEN_DOCUMENT).apply {type="application/json";addCategory(Intent.CATEGORY_OPENABLE)}
        try {startActivityForResult(invoke,intent,"backupSelected")} catch (_:Exception) {invoke.reject("Não foi possível abrir o seletor de backup.")}
    }
    @ActivityCallback fun backupSelected(invoke:Invoke,result:ActivityResult) {
        val uri=result.data?.data
        if(result.resultCode!=Activity.RESULT_OK||uri==null){invoke.resolve(JSObject().apply{put("cancelled",true)});return}
        val finished=java.util.concurrent.atomic.AtomicBoolean(false)
        val handler=android.os.Handler(android.os.Looper.getMainLooper())
        val timeout=Runnable {if(finished.compareAndSet(false,true))invoke.reject("A leitura do backup excedeu o prazo. Escolha um arquivo disponível no aparelho.","BACKUP_READ_TIMEOUT")}
        handler.postDelayed(timeout,30000)
        backupLoader.execute {try {
            val data=activity.contentResolver.openInputStream(uri)?.use {BackupStore.read(it)} ?: error("Indisponível")
            if(finished.compareAndSet(false,true)) {
                val token=java.util.UUID.randomUUID().toString();stagedBackup=Triple(token,android.os.SystemClock.elapsedRealtime(),data)
                invoke.resolve(JSObject().apply {put("token",token);put("tracks",data.library.size);put("queued",data.queue.tracks.size);put("favorites",data.library.count {it.favorite});put("playlists",data.playlists.size);put("albums",data.albums.size);put("createdAt",data.createdAt)})
            }
        } catch (_:Exception) {if(finished.compareAndSet(false,true))invoke.reject("Backup inválido, incompatível ou maior que 10 MB. Nenhum dado foi alterado.","BACKUP_INVALID")}
        finally {handler.removeCallbacks(timeout)}}
    }

    @Command fun cancelBackup(invoke:Invoke) {stagedBackup=null;invoke.resolve(JSObject().apply {put("cancelled",true)})}
    @Command fun restoreBackup(invoke:Invoke) {
        val args=invoke.parseArgs(RestoreArgs::class.java)
        val staged=stagedBackup
        if(staged==null||staged.first!=args.token||android.os.SystemClock.elapsedRealtime()-staged.second>15*60*1000) {invoke.reject("Selecione e confira o backup novamente.","BACKUP_EXPIRED");return}
        if(!restoring.compareAndSet(false,true)){invoke.reject("Restauração em andamento.");return}
        withPlayer(invoke, failure={PlaybackService.abortRestore();restoring.set(false)}) {player ->
            PlaybackService.beginRestore();player.pause();val previousQueue=queueRaw()
            backupLoader.execute {
                var applied=false
                try {
                    LocalLibrary(activity.applicationContext).use {library ->
                        val previous=BackupStore.encode(library.backup(previousQueue)).toByteArray(Charsets.UTF_8)
                        val file=android.util.AtomicFile(java.io.File(activity.filesDir,"before-restore.json"));val stream=file.startWrite()
                        try {stream.write(previous);file.finishWrite(stream)}catch(error:Exception){file.failWrite(stream);throw error}
                        library.restore(staged.third);applied=true
                    }
                    stagedBackup=null
                    android.os.Handler(android.os.Looper.getMainLooper()).post {
                        try {
                            val restored=PlaybackService.applyPending() ?: error("Serviço indisponível")
                            invoke.resolve(state(restored))
                        } catch (_:Exception) {invoke.reject("Dados restaurados. Reabra o aplicativo para concluir a recuperação do player.","BACKUP_PLAYER_PENDING")}
                        finally {PlaybackService.abortRestore();restoring.set(false)}
                    }
                } catch (_:Exception) {
                    android.os.Handler(android.os.Looper.getMainLooper()).post {
                        PlaybackService.abortRestore();restoring.set(false)
                        invoke.reject(if(applied) "Dados restaurados; reabra o aplicativo." else "Não foi possível restaurar. Seus dados anteriores foram preservados.",if(applied) "BACKUP_PLAYER_PENDING" else "BACKUP_RESTORE_FAILED")
                    }
                }
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
