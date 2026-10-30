fn main() {
    tauri_plugin::Builder::new(&["choose", "snapshot", "play", "pause", "seek", "stop"])
        .android_path("android")
        .build();
}
