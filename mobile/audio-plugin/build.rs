fn main() {
    tauri_plugin::Builder::new(&["choose", "snapshot", "play", "pause", "seek", "stop", "next", "previous", "shuffle", "repeat", "jump", "remove", "reorder", "import_library", "library_list", "library_forget", "library_play", "library_enqueue"])
        .android_path("android")
        .build();
}
