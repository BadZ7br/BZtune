use bztune_core::playlists::{PlaylistStore, Request};
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use tempfile::TempDir;

fn fixture() -> (TempDir, PlaylistStore) {
    let dir = tempfile::tempdir().unwrap();
    let store = PlaylistStore::new(dir.path());
    (dir, store)
}
fn create(store: &PlaylistStore) -> String {
    store
        .execute(Request::Create {
            name: "Minha seleção 🎵".into(),
            description: "Favoritas".into(),
        })
        .unwrap()["playlist"]["id"]
        .as_str()
        .unwrap()
        .into()
}
fn song(id: &str) -> Value {
    json!({ "video_id": id, "title": "Faixa", "artist": "Artista", "album": "Álbum" })
}
fn list(store: &PlaylistStore) -> Value {
    store.execute(Request::List).unwrap()
}

#[test]
fn creates_updates_reopens_and_deletes_without_an_http_server() {
    let (dir, store) = fixture();
    let id = create(&store);
    assert_eq!(
        list(&PlaylistStore::new(dir.path()))["playlists"][0]["name"],
        "Minha seleção 🎵"
    );
    let updated = store
        .execute(Request::Update {
            id: id.clone(),
            name: Some("Nova".into()),
            description: None,
        })
        .unwrap();
    assert_eq!(updated["playlist"]["description"], "Favoritas");
    assert_eq!(updated["playlist"]["name"], "Nova");
    assert_eq!(
        store.execute(Request::Delete { id }).unwrap(),
        json!({ "deleted": true })
    );
    assert_eq!(list(&store)["playlists"], json!([]));
}

#[test]
fn mixed_entries_preserve_local_ids_and_existing_audio_contract() {
    let (dir, store) = fixture();
    let id = create(&store);
    let db = Connection::open(dir.path().join("library.sqlite3")).unwrap();
    db.execute(
        "INSERT INTO tracks(id,title,artist,original_name,stored_name,mime,bytes,sha256)
        VALUES ('local-1','Offline','Banda','a.mp3','local-1.mp3','audio/mpeg',42,'hash')",
        [],
    )
    .unwrap();
    store
        .execute(Request::AddTrack {
            id: id.clone(),
            track: json!({ "track_id": "local-1" }),
        })
        .unwrap();
    let result = store
        .execute(Request::AddTrack {
            id: id.clone(),
            track: song("abcdefghijk"),
        })
        .unwrap();
    assert_eq!(result["playlist"]["count"], 2);
    assert_eq!(
        result["playlist"]["tracks"][0]["videoId"],
        "library:local-1"
    );
    assert_eq!(
        result["playlist"]["tracks"][0]["audioUrl"],
        "/api/library/tracks/local-1/audio"
    );
    assert_eq!(result["playlist"]["tracks"][1]["album"], "Álbum");
    assert_eq!(
        store
            .execute(Request::AddTrack {
                id,
                track: song("abcdefghijk")
            })
            .unwrap_err()
            .status,
        409
    );
}

#[test]
fn bulk_counts_invalid_duplicates_and_added_items() {
    let (_dir, store) = fixture();
    let id = create(&store);
    let result = store
        .execute(Request::AddTracks {
            id,
            tracks: vec![
                song("abcdefghijk"),
                song("abcdefghijk"),
                song("bad-id"),
                Value::Null,
                song("01234567890"),
            ],
        })
        .unwrap();
    assert_eq!(
        (
            result["added"].as_u64(),
            result["duplicates"].as_u64(),
            result["invalid"].as_u64()
        ),
        (Some(2), Some(1), Some(2))
    );
    assert_eq!(result["playlist"]["count"], 2);
}

#[test]
fn reorder_is_complete_atomic_and_entry_removal_is_scoped() {
    let (_dir, store) = fixture();
    let id = create(&store);
    let other = create(&store);
    let result = store
        .execute(Request::AddTracks {
            id: id.clone(),
            tracks: vec![song("abcdefghijk"), song("01234567890")],
        })
        .unwrap();
    let ids: Vec<String> = result["playlist"]["tracks"]
        .as_array()
        .unwrap()
        .iter()
        .map(|t| t["id"].as_str().unwrap().into())
        .collect();
    assert_eq!(
        store
            .execute(Request::Reorder {
                id: id.clone(),
                entry_ids: vec![ids[0].clone(), ids[0].clone()]
            })
            .unwrap_err()
            .status,
        400
    );
    assert_eq!(
        list(&store)["playlists"]
            .as_array()
            .unwrap()
            .iter()
            .find(|p| p["id"] == id)
            .unwrap()["tracks"][0]["id"],
        ids[0]
    );
    let sorted = store
        .execute(Request::Reorder {
            id: id.clone(),
            entry_ids: vec![ids[1].clone(), ids[0].clone()],
        })
        .unwrap();
    assert_eq!(sorted["playlist"]["tracks"][0]["id"], ids[1]);
    assert_eq!(
        store
            .execute(Request::RemoveEntry {
                id: other,
                entry_id: ids[0].clone()
            })
            .unwrap()["deleted"],
        false
    );
    assert_eq!(
        store
            .execute(Request::RemoveEntry {
                id,
                entry_id: ids[0].clone()
            })
            .unwrap()["playlist"]["count"],
        1
    );
}

#[test]
fn upgrades_legacy_schema_once_without_resurrecting_removed_entries() {
    let (dir, store) = fixture();
    let db = Connection::open(dir.path().join("library.sqlite3")).unwrap();
    // An actual pre-mixed-playlist shape: no cover column, entries or marker.
    db.execute_batch("CREATE TABLE tracks (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, artist TEXT NOT NULL,
        original_name TEXT NOT NULL, stored_name TEXT NOT NULL, mime TEXT NOT NULL,
        bytes INTEGER NOT NULL, sha256 TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE playlists (id TEXT PRIMARY KEY, name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE playlist_items (playlist_id TEXT NOT NULL, track_id TEXT NOT NULL,
            position INTEGER NOT NULL, PRIMARY KEY(playlist_id,track_id));")
        .unwrap();
    db.execute(
        "INSERT INTO tracks(id,title,artist,original_name,stored_name,mime,bytes,sha256)
        VALUES ('old-track','Antiga','Banda','old.mp3','old.mp3','audio/mpeg',1,'old-hash')",
        [],
    )
    .unwrap();
    db.execute(
        "INSERT INTO playlists(id,name) VALUES ('old-playlist','Coleção antiga')",
        [],
    )
    .unwrap();
    db.execute("INSERT INTO playlist_items(playlist_id,track_id,position) VALUES ('old-playlist','old-track',0)", []).unwrap();
    let old = list(&store);
    assert_eq!(old["playlists"][0]["tracks"][0]["trackId"], "old-track");
    assert_eq!(
        db.query_row("SELECT COUNT(*) FROM playlist_items", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        1
    );
    let entry_id = old["playlists"][0]["tracks"][0]["id"]
        .as_str()
        .unwrap()
        .to_string();
    store
        .execute(Request::RemoveEntry {
            id: "old-playlist".into(),
            entry_id,
        })
        .unwrap();
    assert_eq!(list(&store)["playlists"][0]["count"], 0);
    let columns: String = db
        .query_row(
            "SELECT group_concat(name) FROM pragma_table_info('playlists')",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert!(columns.contains("cover_name"));
}

#[test]
fn invalid_metadata_and_missing_playlists_do_not_create_data() {
    let (_dir, store) = fixture();
    assert_eq!(
        store
            .execute(Request::Create {
                name: "  ".into(),
                description: "".into()
            })
            .unwrap_err()
            .status,
        400
    );
    assert_eq!(
        store
            .execute(Request::Delete {
                id: "missing".into()
            })
            .unwrap_err()
            .status,
        404
    );
    assert_eq!(list(&store)["playlists"], json!([]));
    let id = create(&store);
    assert_eq!(
        store
            .execute(Request::AddTrack {
                id: id.clone(),
                track: json!({"track_id":"missing"})
            })
            .unwrap_err()
            .status,
        400
    );
    assert_eq!(list(&store)["playlists"][0]["count"], 0);
    let result = store
        .execute(Request::Update {
            id,
            name: Some("🎵".repeat(110)),
            description: None,
        })
        .unwrap();
    assert_eq!(
        result["playlist"]["name"].as_str().unwrap().chars().count(),
        100
    );
}

#[test]
fn deleting_a_playlist_cascades_entries_but_preserves_audio_and_other_files() {
    let (dir, store) = fixture();
    let id = create(&store);
    store
        .execute(Request::AddTrack {
            id: id.clone(),
            track: song("abcdefghijk"),
        })
        .unwrap();
    let db = Connection::open(dir.path().join("library.sqlite3")).unwrap();
    let protected = dir.path().join("keep.txt");
    std::fs::write(&protected, "keep").unwrap();
    db.execute(
        "UPDATE playlists SET cover_name='../keep.txt' WHERE id=?",
        params![id],
    )
    .unwrap();
    store.execute(Request::Delete { id }).unwrap();
    assert!(protected.exists());
    assert_eq!(
        db.query_row("SELECT COUNT(*) FROM playlist_entries", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        0
    );
}

#[test]
fn concurrent_native_writers_append_without_losing_entries_or_positions() {
    let (dir, store) = fixture();
    let id = create(&store);
    let handles: Vec<_> = (0..8)
        .map(|index| {
            let store = store.clone();
            let id = id.clone();
            std::thread::spawn(move || {
                store
                    .execute(Request::AddTrack {
                        id,
                        track: song(&format!("{index:011}")),
                    })
                    .unwrap()
            })
        })
        .collect();
    for handle in handles {
        handle.join().unwrap();
    }
    assert_eq!(list(&store)["playlists"][0]["count"], 8);
    let db = Connection::open(dir.path().join("library.sqlite3")).unwrap();
    let positions: i64 = db
        .query_row(
            "SELECT COUNT(DISTINCT position) FROM playlist_entries WHERE playlist_id=?",
            [id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(positions, 8);
}
