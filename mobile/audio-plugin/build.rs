fn main() {
    tauri_plugin::Builder::new(&["choose", "snapshot", "play", "pause", "seek", "stop", "next", "previous", "shuffle", "repeat", "jump", "remove", "reorder", "import_library", "library_list", "library_forget", "library_play", "library_enqueue", "export_backup", "stage_backup", "cancel_backup", "restore_backup", "export_previous_backup"])
        .android_path("android")
        .build();
}
