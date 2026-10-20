use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    time::Duration,
};
use uuid::Uuid;

#[derive(Debug, Serialize)]
pub struct ServiceError {
    pub error: String,
    pub status: u16,
}

impl ServiceError {
    fn new(status: u16, message: &str) -> Self {
        Self {
            error: message.into(),
            status,
        }
    }
}
impl From<rusqlite::Error> for ServiceError {
    fn from(_: rusqlite::Error) -> Self {
        Self::new(500, "Não foi possível acessar o banco de playlists.")
    }
}

/// Commands accept identifiers and metadata, never database paths from the WebView.
#[derive(Debug, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum Request {
    List,
    Create {
        name: String,
        #[serde(default)]
        description: String,
    },
    Update {
        id: String,
        name: Option<String>,
        description: Option<String>,
    },
    Delete {
        id: String,
    },
    AddTrack {
        id: String,
        track: Value,
    },
    AddTracks {
        id: String,
        tracks: Vec<Value>,
    },
    RemoveEntry {
        id: String,
        entry_id: String,
    },
    Reorder {
        id: String,
        entry_ids: Vec<String>,
    },
}

#[derive(Clone)]
pub struct PlaylistStore {
    library: PathBuf,
}

impl PlaylistStore {
    pub fn new(library: impl Into<PathBuf>) -> Self {
        Self {
            library: library.into(),
        }
    }

    fn open(&self) -> Result<Connection, ServiceError> {
        std::fs::create_dir_all(&self.library)
            .map_err(|_| ServiceError::new(500, "Não foi possível abrir a biblioteca."))?;
        let mut db = Connection::open(self.library.join("library.sqlite3"))?;
        db.busy_timeout(Duration::from_secs(5))?;
        db.pragma_update(None, "foreign_keys", "ON")?;
        // Serialize schema changes with writes from both native commands and the
        // remaining Python services. Preserve their table names, IDs and marker.
        let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
        tx.execute_batch(include_str!("playlists_schema.sql"))?;
        let has_cover = {
            let mut stmt = tx.prepare("PRAGMA table_info(playlists)")?;
            let names = stmt
                .query_map([], |row| row.get::<_, String>(1))?
                .collect::<Result<Vec<_>, _>>()?;
            names.iter().any(|name| name == "cover_name")
        };
        if !has_cover {
            tx.execute("ALTER TABLE playlists ADD COLUMN cover_name TEXT", [])?;
        }
        let migrated = tx
            .query_row(
                "SELECT 1 FROM doomvault_schema_state WHERE key='mixed_playlists_v1'",
                [],
                |_| Ok(()),
            )
            .optional()?
            .is_some();
        if !migrated {
            let legacy = {
                let mut stmt = tx.prepare(
                    "SELECT pi.playlist_id, pi.track_id, pi.position, t.title, t.artist
                    FROM playlist_items pi JOIN tracks t ON t.id=pi.track_id
                    ORDER BY pi.playlist_id, pi.position",
                )?;
                let rows = stmt
                    .query_map([], |r| {
                        Ok((
                            r.get::<_, String>(0)?,
                            r.get::<_, String>(1)?,
                            r.get::<_, i64>(2)?,
                            r.get::<_, String>(3)?,
                            r.get::<_, String>(4)?,
                        ))
                    })?
                    .collect::<Result<Vec<_>, _>>()?;
                rows
            };
            for (playlist, track, position, title, artist) in legacy {
                tx.execute(
                    "INSERT OR IGNORE INTO playlist_entries
                    (id,playlist_id,source,ref_key,track_id,video_id,title,artist,position)
                    VALUES (?,?, 'local', ?,?,NULL,?,?,?)",
                    params![
                        new_id(),
                        playlist,
                        format!("local:{track}"),
                        track,
                        title,
                        artist,
                        position
                    ],
                )?;
            }
            tx.execute("INSERT INTO doomvault_schema_state(key,value) VALUES ('mixed_playlists_v1','done')", [])?;
        }
        tx.execute(
            "DELETE FROM playlist_entries WHERE source='local'
            AND track_id NOT IN (SELECT id FROM tracks)",
            [],
        )?;
        tx.commit()?;
        Ok(db)
    }

    pub fn execute(&self, request: Request) -> Result<Value, ServiceError> {
        let mut db = self.open()?;
        // A write transaction also protects append/reorder from concurrent Python
        // writes. Returning an error drops and rolls back the whole transaction.
        let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let mut cover_to_remove = None;
        let result = match request {
            Request::List => {
                let mut stmt =
                    tx.prepare("SELECT id FROM playlists ORDER BY created_at DESC,name")?;
                let ids = stmt
                    .query_map([], |row| row.get::<_, String>(0))?
                    .collect::<Result<Vec<_>, _>>()?;
                let playlists = ids
                    .iter()
                    .map(|id| playlist_json(&tx, id))
                    .collect::<Result<Vec<_>, _>>()?;
                json!({ "playlists": playlists })
            }
            Request::Create { name, description } => {
                let name = limited(&name, 100, true);
                if name.is_empty() {
                    return Err(ServiceError::new(400, "Informe um nome para a playlist."));
                }
                let id = new_id();
                tx.execute(
                    "INSERT INTO playlists(id,name,description) VALUES (?,?,?)",
                    params![id, name, limited(&description, 400, true)],
                )?;
                json!({ "playlist": playlist_json(&tx, &id)? })
            }
            Request::Update {
                id,
                name,
                description,
            } => {
                require_playlist(&tx, &id)?;
                if let Some(name) = name {
                    let name = limited(&name, 100, true);
                    if name.is_empty() {
                        return Err(ServiceError::new(400, "Nome inválido."));
                    }
                    tx.execute("UPDATE playlists SET name=? WHERE id=?", params![name, id])?;
                }
                if let Some(description) = description {
                    tx.execute(
                        "UPDATE playlists SET description=? WHERE id=?",
                        params![limited(&description, 400, false), id],
                    )?;
                }
                json!({ "playlist": playlist_json(&tx, &id)? })
            }
            Request::Delete { id } => {
                require_playlist(&tx, &id)?;
                cover_to_remove =
                    tx.query_row("SELECT cover_name FROM playlists WHERE id=?", [&id], |r| {
                        r.get::<_, Option<String>>(0)
                    })?;
                tx.execute("DELETE FROM playlists WHERE id=?", [&id])?;
                json!({ "deleted": true })
            }
            Request::AddTrack { id, track } => {
                require_playlist(&tx, &id)?;
                let position = next_position(&tx, &id)?;
                if !add_entry(&tx, &id, &track, position)? {
                    return Err(ServiceError::new(409, "Música já está na playlist."));
                }
                json!({ "playlist": playlist_json(&tx, &id)? })
            }
            Request::AddTracks { id, tracks } => {
                if tracks.is_empty() || tracks.len() > 200 {
                    return Err(ServiceError::new(400, "Envie de 1 a 200 músicas."));
                }
                require_playlist(&tx, &id)?;
                let (mut added, mut duplicates, mut invalid) = (0, 0, 0);
                let mut position = next_position(&tx, &id)?;
                for track in tracks {
                    match add_entry(&tx, &id, &track, position) {
                        Ok(true) => {
                            added += 1;
                            position += 1;
                        }
                        Ok(false) => duplicates += 1,
                        Err(err) if err.status == 400 => invalid += 1,
                        Err(err) => return Err(err),
                    }
                }
                json!({ "added": added, "duplicates": duplicates, "invalid": invalid,
                    "playlist": playlist_json(&tx, &id)? })
            }
            Request::RemoveEntry { id, entry_id } => {
                require_playlist(&tx, &id)?;
                let deleted = tx.execute(
                    "DELETE FROM playlist_entries WHERE id=? AND playlist_id=?",
                    params![entry_id, id],
                )? > 0;
                json!({ "deleted": deleted, "playlist": playlist_json(&tx, &id)? })
            }
            Request::Reorder { id, entry_ids } => {
                require_playlist(&tx, &id)?;
                let mut stmt = tx.prepare("SELECT id FROM playlist_entries WHERE playlist_id=?")?;
                let existing = stmt
                    .query_map([&id], |r| r.get::<_, String>(0))?
                    .collect::<Result<HashSet<_>, _>>()?;
                let supplied: HashSet<_> = entry_ids.iter().cloned().collect();
                if supplied.len() != entry_ids.len() || supplied != existing {
                    return Err(ServiceError::new(
                        400,
                        "A ordem precisa conter todas as músicas, sem duplicatas.",
                    ));
                }
                for (position, entry) in entry_ids.iter().enumerate() {
                    tx.execute(
                        "UPDATE playlist_entries SET position=? WHERE playlist_id=? AND id=?",
                        params![position as i64, id, entry],
                    )?;
                }
                json!({ "playlist": playlist_json(&tx, &id)? })
            }
        };
        tx.commit()?;
        // Only remove a filename inside the cover directory, never a path taken
        // verbatim from an imported database. Cover cleanup is best effort.
        if let Some(filename) = cover_to_remove {
            if Path::new(&filename)
                .file_name()
                .and_then(|name| name.to_str())
                == Some(&filename)
                && !filename.contains(['/', '\\'])
                && filename != "."
                && filename != ".."
            {
                let _ = std::fs::remove_file(self.library.join("playlist_covers").join(filename));
            }
        }
        Ok(result)
    }
}

fn new_id() -> String {
    Uuid::new_v4().simple().to_string()
}
fn limited(value: &str, limit: usize, trim: bool) -> String {
    (if trim { value.trim() } else { value })
        .chars()
        .take(limit)
        .collect()
}
fn text<'a>(value: &'a Value, field: &str) -> &'a str {
    value.get(field).and_then(Value::as_str).unwrap_or("")
}
fn require_playlist(db: &Connection, id: &str) -> Result<(), ServiceError> {
    if db
        .query_row("SELECT 1 FROM playlists WHERE id=?", [id], |_| Ok(()))
        .optional()?
        .is_none()
    {
        return Err(ServiceError::new(404, "Playlist não encontrada."));
    }
    Ok(())
}
fn next_position(db: &Connection, id: &str) -> Result<i64, ServiceError> {
    Ok(db.query_row(
        "SELECT COALESCE(MAX(position),-1)+1 FROM playlist_entries WHERE playlist_id=?",
        [id],
        |r| r.get(0),
    )?)
}

fn add_entry(
    db: &Connection,
    playlist: &str,
    data: &Value,
    position: i64,
) -> Result<bool, ServiceError> {
    if !data.is_object() {
        return Err(ServiceError::new(400, "Música inválida."));
    }
    let track_id = text(data, "track_id").trim();
    let (source, reference, track, video, title, artist, album, cover);
    if !track_id.is_empty() {
        let local = db
            .query_row(
                "SELECT title,artist FROM tracks WHERE id=?",
                [track_id],
                |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
            )
            .optional()?
            .ok_or_else(|| ServiceError::new(400, "Música local não encontrada."))?;
        source = "local";
        reference = format!("local:{track_id}");
        track = Some(track_id);
        video = None;
        title = local.0;
        artist = local.1;
        album = String::new();
        cover = None;
    } else {
        let id = if text(data, "video_id").is_empty() {
            text(data, "videoId")
        } else {
            text(data, "video_id")
        }
        .trim();
        if id.len() != 11
            || !id
                .bytes()
                .all(|ch| ch.is_ascii_alphanumeric() || ch == b'-' || ch == b'_')
        {
            return Err(ServiceError::new(
                400,
                "A música online precisa de um video_id válido.",
            ));
        }
        title = limited(text(data, "title"), 200, true);
        artist = limited(text(data, "artist"), 200, true);
        if title.is_empty() || artist.is_empty() {
            return Err(ServiceError::new(400, "Informe título e artista."));
        }
        source = "web";
        reference = format!("web:{id}");
        track = None;
        video = Some(id);
        album = limited(text(data, "album"), 200, false);
        cover = text(data, "cover")
            .starts_with("https://")
            .then(|| limited(text(data, "cover"), 1200, false));
    }
    Ok(db.execute(
        "INSERT OR IGNORE INTO playlist_entries
        (id,playlist_id,source,ref_key,track_id,video_id,title,artist,album,cover,position)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        params![
            new_id(),
            playlist,
            source,
            reference,
            track,
            video,
            title,
            artist,
            album,
            cover,
            position
        ],
    )? == 1)
}

fn playlist_json(db: &Connection, id: &str) -> Result<Value, ServiceError> {
    let mut playlist = db.query_row("SELECT id,name,description,created_at,cover_name FROM playlists WHERE id=?", [id], |r| {
        let cover: Option<String> = r.get(4)?;
        Ok(json!({ "id": r.get::<_, String>(0)?, "name": r.get::<_, String>(1)?,
            "description": r.get::<_, String>(2)?, "created_at": r.get::<_, String>(3)?,
            "coverUrl": cover.filter(|s| !s.is_empty()).map(|_| format!("/api/playlists/{id}/cover")) }))
    })?;
    let mut stmt = db.prepare(
        "SELECT id,source,video_id,title,artist,album,cover,track_id FROM playlist_entries
        WHERE playlist_id=? ORDER BY position,id",
    )?;
    let mut entries = stmt.query_map([id], |r| {
        let track: Option<String> = r.get(7)?;
        let video: Option<String> = r.get(2)?;
        let album: String = r.get(5)?;
        Ok(json!({ "id": r.get::<_, String>(0)?, "source": r.get::<_, String>(1)?,
            "videoId": video.filter(|s| !s.is_empty()).unwrap_or_else(|| track.as_ref().map(|t| format!("library:{t}")).unwrap_or_default()),
            "title": r.get::<_, String>(3)?, "artist": r.get::<_, String>(4)?,
            "album": if album.is_empty() { None } else { Some(album) },
            "cover": r.get::<_, Option<String>>(6)?, "trackId": track, "audioUrl": null }))
    })?.collect::<Result<Vec<_>, _>>()?;
    // Preserve the existing Python representation while audio/cover delivery is
    // migrated separately. Do not change recording matching in this migration.
    for entry in &mut entries {
        let local: Option<String> = if entry["source"] == "local" {
            db.query_row(
                "SELECT id FROM tracks WHERE id=?",
                [text(entry, "trackId")],
                |r| r.get(0),
            )
            .optional()?
        } else {
            db.query_row(
                "SELECT id FROM tracks WHERE LOWER(TRIM(title))=LOWER(TRIM(?))
                AND LOWER(TRIM(artist))=LOWER(TRIM(?)) ORDER BY created_at DESC LIMIT 1",
                params![text(entry, "title"), text(entry, "artist")],
                |r| r.get(0),
            )
            .optional()?
        };
        if let Some(track) = local {
            entry["audioUrl"] = json!(format!("/api/library/tracks/{track}/audio"));
            entry["cover"] = json!(format!("/api/library/tracks/{track}/cover"));
            entry["trackId"] = json!(track);
        }
    }
    playlist["count"] = json!(entries.len());
    playlist["tracks"] = json!(entries);
    Ok(playlist)
}
