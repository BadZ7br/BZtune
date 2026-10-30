fn main() {
    tauri_plugin::Builder::new(&["choose", "snapshot", "play", "pause", "seek", "stop", "next", "previous", "shuffle", "repeat", "jump", "remove", "reorder"])
        .android_path("android")
        .build();
}
