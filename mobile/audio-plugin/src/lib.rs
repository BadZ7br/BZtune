use tauri::{plugin::{Builder, TauriPlugin}, Runtime};

#[cfg(target_os = "android")]
mod android {
    use super::*;
    use tauri::{plugin::PluginHandle, Manager, State};
    pub struct Audio<R: Runtime>(pub PluginHandle<R>);
    async fn call<R: Runtime>(handle: PluginHandle<R>, name: &'static str, args: serde_json::Value) -> Result<serde_json::Value, String> {
        tauri::async_runtime::spawn_blocking(move || handle.run_mobile_plugin(name, args).map_err(|_| "Não foi possível acessar o áudio Android.".to_string()))
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
    pub fn plugin<R: Runtime>() -> TauriPlugin<R> {
        Builder::new("bztune-audio")
            .invoke_handler(tauri::generate_handler![choose,snapshot,play,pause,seek,stop,next,previous,shuffle,repeat,jump,remove,reorder])
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
