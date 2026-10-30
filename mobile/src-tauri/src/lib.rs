#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_bztune_audio::init())
        .run(tauri::generate_context!())
        .expect("Falha ao iniciar BZtune Android");
}
