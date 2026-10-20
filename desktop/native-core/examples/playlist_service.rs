//! Development harness for testing the native service against the legacy database.
use bztune_core::playlists::{PlaylistStore, Request};
use serde_json::json;
use std::io::{self, BufRead};

fn main() {
    let library = std::env::args_os()
        .nth(1)
        .expect("usage: playlist_service LIBRARY_DIRECTORY");
    let store = PlaylistStore::new(library);
    for line in io::stdin().lock().lines() {
        let request: Request =
            serde_json::from_str(&line.expect("stdin read failed")).expect("invalid request");
        let response = match store.execute(request) {
            Ok(value) => json!({ "ok": true, "value": value }),
            Err(error) => json!({ "ok": false, "error": error }),
        };
        println!("{response}");
    }
}
