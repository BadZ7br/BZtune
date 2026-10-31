use tauri::{plugin::{Builder, TauriPlugin}, Runtime};

#[cfg(target_os = "android")]
mod android {
    use super::*;
    use tauri::{plugin::PluginHandle, Manager, State};
    pub struct Audio<R: Runtime>(pub PluginHandle<R>);
    async fn call<R: Runtime>(handle: PluginHandle<R>, name: &'static str, args: serde_json::Value) -> Result<serde_json::Value, String> {
        tauri::async_runtime::spawn_blocking(move || handle.run_mobile_plugin(name, args).map_err(|error| {
            if let tauri::plugin::mobile::PluginInvokeError::InvokeRejected(response) = error {
                match response.code.as_deref() {
                    Some("LIBRARY_IMPORT_TIMEOUT") => return "A importação excedeu o prazo. Tente um lote menor de arquivos locais.".to_string(),
                    Some("LIBRARY_IMPORT_FAILED") => return "Não foi possível importar. Verifique o acesso aos arquivos e tente novamente.".to_string(),
                    Some("LIBRARY_LOAD_FAILED") => return "Não foi possível carregar a biblioteca. Tente novamente.".to_string(),
                    Some("LIBRARY_REMOVE_FAILED") => return "Não foi possível remover o registro da biblioteca.".to_string(),
                    Some("LIBRARY_FAVORITE_FAILED") => return "Não foi possível atualizar o favorito. Recarregue a biblioteca e tente novamente.".to_string(),
                    Some("LIBRARY_FILE_UNAVAILABLE") => return "Arquivo indisponível ou acesso revogado. Importe novamente pelo seletor Android.".to_string(),
                    Some("BACKUP_PREVIOUS_MISSING") => return "Ainda não há cópia anterior de restauração.".to_string(),
                    Some("BACKUP_READ_TIMEOUT") => return "A leitura do backup excedeu o prazo. Escolha um arquivo disponível no aparelho.".to_string(),
                    Some("BACKUP_INVALID") => return "Backup inválido, incompatível ou maior que 10 MB. Nenhum dado foi alterado.".to_string(),
                    Some("BACKUP_EXPIRED") => return "Selecione e confira o backup novamente.".to_string(),
                    Some("BACKUP_RESTORE_FAILED") => return "Não foi possível restaurar. Seus dados anteriores foram preservados.".to_string(),
                    Some("BACKUP_PLAYER_PENDING") => return "Dados restaurados. Reabra o aplicativo para concluir a recuperação do player.".to_string(),
                    Some("BACKUP_EXPORT_FAILED") => return "Não foi possível concluir o backup. Descarte o arquivo incompleto e tente novamente.".to_string(),
                    Some("ALBUM_CHANGED") => return "O álbum mudou. Recarregue antes de tentar novamente.".to_string(),
                    Some("ALBUM_LIMIT") => return "Limite desta versão: 2.000 álbuns salvos entre favoritos e coleção.".to_string(),
                    Some("ALBUM_INVALID") => return "Filtro de álbuns inválido.".to_string(),
                    Some("ALBUM_FAILED") => return "Não foi possível atualizar os álbuns. Recarregue e tente novamente.".to_string(),
                    Some("PLAYLIST_CHANGED") => return "A playlist ou biblioteca mudou. Recarregue antes de tentar novamente.".to_string(),
                    Some("PLAYLIST_INVALID") => return "Use um nome de 1 a 120 caracteres e uma seleção válida.".to_string(),
                    Some("PLAYLIST_LIMIT") => return "Limite desta versão: 100 playlists, com até 200 músicas em cada uma.".to_string(),
                    Some("PLAYLIST_EMPTY") => return "Adicione músicas à playlist antes de reproduzir.".to_string(),
                    Some("PLAYLIST_TIMEOUT") => return "A preparação da playlist excedeu o prazo. Confira o acesso aos arquivos.".to_string(),
                    Some("PLAYLIST_FAILED") => return "Não foi possível concluir a operação. Recarregue as playlists e confira a fila.".to_string(),
                    Some("TRACK_CHANGED") => return "A faixa mudou. Aguarde os novos detalhes.".to_string(),
                    Some("TRACK_DETAILS_FAILED") => return "Não foi possível carregar os detalhes da faixa.".to_string(),
                    Some("QUEUE_LIMIT") => return "A fila de teste aceita até 200 músicas.".to_string(),
                    _ => {}
                }
            }
            "Não foi possível acessar o áudio Android.".to_string()
        }))
            .await.map_err(|_| "O serviço de áudio não respondeu.".to_string())?
    }
    #[tauri::command]
    pub async fn choose<R: Runtime>(_app: tauri::AppHandle<R>, state: State<'_, Audio<R>>, append: Option<bool>) -> Result<serde_json::Value, String> { call(state.0.clone(), "choose", serde_json::json!({"append":append.unwrap_or(false)})).await }
    #[tauri::command]
    pub async fn snapshot<R: Runtime>(_app: tauri::AppHandle<R>, state: State<'_, Audio<R>>) -> Result<serde_json::Value, String> { call(state.0.clone(), "snapshot", serde_json::json!({})).await }
    #[tauri::command]
    pub async fn play<R: Runtime>(_app: tauri::AppHandle<R>, state: State<'_, Audio<R>>) -> Result<serde_json::Value, String> { call(state.0.clone(), "play", serde_json::json!({})).await }
    #[tauri::command]
    pub async fn pause<R: Runtime>(_app: tauri::AppHandle<R>, state: State<'_, Audio<R>>) -> Result<serde_json::Value, String> { call(state.0.clone(), "pause", serde_json::json!({})).await }
    #[tauri::command]
    pub async fn stop<R: Runtime>(_app: tauri::AppHandle<R>, state: State<'_, Audio<R>>) -> Result<serde_json::Value, String> { call(state.0.clone(), "stop", serde_json::json!({})).await }
    #[tauri::command]
    pub async fn seek<R: Runtime>(_app: tauri::AppHandle<R>, state: State<'_, Audio<R>>, position: u64) -> Result<serde_json::Value, String> { call(state.0.clone(), "seek", serde_json::json!({"position":position})).await }
    #[tauri::command]
    pub async fn next<R: Runtime>(_app: tauri::AppHandle<R>, state: State<'_, Audio<R>>) -> Result<serde_json::Value, String> { call(state.0.clone(), "next", serde_json::json!({})).await }
    #[tauri::command]
    pub async fn previous<R: Runtime>(_app: tauri::AppHandle<R>, state: State<'_, Audio<R>>) -> Result<serde_json::Value, String> { call(state.0.clone(), "previous", serde_json::json!({})).await }
    #[tauri::command]
    pub async fn shuffle<R: Runtime>(_app: tauri::AppHandle<R>, state: State<'_, Audio<R>>) -> Result<serde_json::Value, String> { call(state.0.clone(), "shuffle", serde_json::json!({})).await }
    #[tauri::command]
    pub async fn repeat<R: Runtime>(_app: tauri::AppHandle<R>, state: State<'_, Audio<R>>) -> Result<serde_json::Value, String> { call(state.0.clone(), "repeat", serde_json::json!({})).await }
    #[tauri::command]
    pub async fn jump<R: Runtime>(_app: tauri::AppHandle<R>, state: State<'_, Audio<R>>, index: u32, id: String) -> Result<serde_json::Value, String> { call(state.0.clone(), "jump", serde_json::json!({"index":index,"id":id})).await }
    #[tauri::command]
    pub async fn remove<R: Runtime>(_app: tauri::AppHandle<R>, state: State<'_, Audio<R>>, index: u32, id: String) -> Result<serde_json::Value, String> { call(state.0.clone(), "remove", serde_json::json!({"index":index,"id":id})).await }
    #[tauri::command]
    pub async fn reorder<R: Runtime>(_app: tauri::AppHandle<R>, state: State<'_, Audio<R>>, index: u32, id: String, to: u32) -> Result<serde_json::Value, String> { call(state.0.clone(), "reorder", serde_json::json!({"index":index,"id":id,"to":to})).await }
    #[tauri::command]
    pub async fn import_library<R: Runtime>(_app: tauri::AppHandle<R>, state: State<'_, Audio<R>>) -> Result<serde_json::Value, String> { call(state.0.clone(), "choose", serde_json::json!({"library":true})).await }
    #[tauri::command]
    pub async fn library_list<R: Runtime>(_app: tauri::AppHandle<R>, state: State<'_, Audio<R>>, query: Option<String>, artist: Option<String>, album: Option<String>, page: Option<u32>, favorites_only: Option<bool>) -> Result<serde_json::Value, String> { call(state.0.clone(), "libraryList", serde_json::json!({"query":query.unwrap_or_default(),"artist":artist.unwrap_or_default(),"album":album.unwrap_or_default(),"page":page.unwrap_or(0),"favoritesOnly":favorites_only.unwrap_or(false)})).await }
    #[tauri::command]
    pub async fn library_favorite<R: Runtime>(_app: tauri::AppHandle<R>, state: State<'_, Audio<R>>, id: String, favorite: bool) -> Result<serde_json::Value, String> { call(state.0.clone(), "libraryFavorite", serde_json::json!({"id":id,"favorite":favorite})).await }
    #[tauri::command]
    pub async fn library_forget<R: Runtime>(_app: tauri::AppHandle<R>, state: State<'_, Audio<R>>, id: String) -> Result<serde_json::Value, String> { call(state.0.clone(), "libraryForget", serde_json::json!({"id":id})).await }
    #[tauri::command]
    pub async fn library_play<R: Runtime>(_app: tauri::AppHandle<R>, state: State<'_, Audio<R>>, id: String) -> Result<serde_json::Value, String> { call(state.0.clone(), "libraryPlay", serde_json::json!({"id":id})).await }
    #[tauri::command]
    pub async fn library_enqueue<R: Runtime>(_app: tauri::AppHandle<R>, state: State<'_, Audio<R>>, id: String) -> Result<serde_json::Value, String> { call(state.0.clone(), "libraryEnqueue", serde_json::json!({"id":id})).await }
    #[tauri::command]
    pub async fn export_backup<R: Runtime>(_app: tauri::AppHandle<R>, state: State<'_, Audio<R>>) -> Result<serde_json::Value, String> { call(state.0.clone(), "exportBackup", serde_json::json!({})).await }
    #[tauri::command]
    pub async fn stage_backup<R: Runtime>(_app: tauri::AppHandle<R>, state: State<'_, Audio<R>>) -> Result<serde_json::Value, String> { call(state.0.clone(), "stageBackup", serde_json::json!({})).await }
    #[tauri::command]
    pub async fn cancel_backup<R: Runtime>(_app: tauri::AppHandle<R>, state: State<'_, Audio<R>>) -> Result<serde_json::Value, String> { call(state.0.clone(), "cancelBackup", serde_json::json!({})).await }
    #[tauri::command]
    pub async fn restore_backup<R: Runtime>(_app: tauri::AppHandle<R>, state: State<'_, Audio<R>>, token: String) -> Result<serde_json::Value, String> { call(state.0.clone(), "restoreBackup", serde_json::json!({"token":token})).await }
    #[tauri::command]
    pub async fn export_previous_backup<R: Runtime>(_app: tauri::AppHandle<R>, state: State<'_, Audio<R>>) -> Result<serde_json::Value, String> { call(state.0.clone(), "exportBackup", serde_json::json!({"previous":true})).await }
    #[tauri::command]
    pub async fn playlists<R: Runtime>(_app: tauri::AppHandle<R>, state: State<'_, Audio<R>>, request: serde_json::Value) -> Result<serde_json::Value, String> { call(state.0.clone(), "playlists", request).await }
    #[tauri::command]
    pub async fn playlist_play<R: Runtime>(_app: tauri::AppHandle<R>, state: State<'_, Audio<R>>, id: String, revision: u32) -> Result<serde_json::Value, String> { call(state.0.clone(), "playlistPlay", serde_json::json!({"id":id,"revision":revision})).await }
    #[tauri::command]
    pub async fn playlist_enqueue<R: Runtime>(_app: tauri::AppHandle<R>, state: State<'_, Audio<R>>, id: String, revision: u32) -> Result<serde_json::Value, String> { call(state.0.clone(), "playlistEnqueue", serde_json::json!({"id":id,"revision":revision})).await }
    #[tauri::command]
    pub async fn albums<R: Runtime>(_app: tauri::AppHandle<R>, state: State<'_, Audio<R>>, request: serde_json::Value) -> Result<serde_json::Value, String> { call(state.0.clone(), "albums", request).await }
    #[tauri::command]
    pub async fn track_details<R: Runtime>(_app: tauri::AppHandle<R>, state: State<'_, Audio<R>>, id: String) -> Result<serde_json::Value, String> { call(state.0.clone(), "trackDetails", serde_json::json!({"id":id})).await }
    pub fn plugin<R: Runtime>() -> TauriPlugin<R> {
        Builder::new("bztune-audio")
            .invoke_handler(tauri::generate_handler![choose,snapshot,play,pause,seek,stop,next,previous,shuffle,repeat,jump,remove,reorder,import_library,library_list,library_favorite,library_forget,library_play,library_enqueue,export_backup,stage_backup,cancel_backup,restore_backup,export_previous_backup,playlists,playlist_play,playlist_enqueue,albums,track_details])
            .setup(|app,api| {app.manage(Audio(api.register_android_plugin("com.bztune.audio", "AudioPlugin")?)); Ok(())})
            .build()
    }
}
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    #[cfg(target_os = "android")]
    { android::plugin() }
    #[cfg(not(target_os = "android"))]
    { Builder::new("bztune-audio").build() }
}
