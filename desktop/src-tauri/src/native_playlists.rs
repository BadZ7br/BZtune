use bztune_core::playlists::{PlaylistStore, Request, ServiceError};
use serde_json::Value;
use std::path::PathBuf;
use tauri::{Manager, State};

/// Keep the current Windows library location. Development shares the checkout
/// library with Flask; future mobile builds use the platform application data.
pub fn store(app: &tauri::AppHandle) -> Result<PlaylistStore, Box<dyn std::error::Error>> {
    let library =
        if let Some(path) = std::env::var_os("BZTUNE_LIBRARY_DIR").filter(|p| !p.is_empty()) {
            let path = PathBuf::from(path);
            let path = if let Ok(suffix) = path.strip_prefix("~") {
                app.path().home_dir()?.join(suffix)
            } else {
                path
            };
            if path.is_absolute() {
                path
            } else {
                std::env::current_dir()?.join(path)
            }
        } else if cfg!(all(
            debug_assertions,
            not(any(target_os = "android", target_os = "ios"))
        )) {
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../doomvault-api/doomvault_library")
        } else if cfg!(target_os = "windows") {
            let root = std::env::var_os("LOCALAPPDATA")
                .map(PathBuf::from)
                .unwrap_or(app.path().home_dir()?.join("AppData/Local"));
            root.join("BZtune/library")
        } else {
            app.path().app_data_dir()?.join("library")
        };
    Ok(PlaylistStore::new(library))
}

#[tauri::command]
pub async fn native_playlists(
    store: State<'_, PlaylistStore>,
    request: Request,
) -> Result<Value, ServiceError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || store.execute(request))
        .await
        .map_err(|_| ServiceError {
            error: "Não foi possível concluir a operação de playlists.".into(),
            status: 500,
        })?
}
