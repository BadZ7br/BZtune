-- Compatible subset of the existing library and mixed-playlist schema.
CREATE TABLE IF NOT EXISTS tracks (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, artist TEXT NOT NULL,
    original_name TEXT NOT NULL, stored_name TEXT NOT NULL,
    mime TEXT NOT NULL, bytes INTEGER NOT NULL, sha256 TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS playlists (
    id TEXT PRIMARY KEY, name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS playlist_items (
    playlist_id TEXT NOT NULL, track_id TEXT NOT NULL, position INTEGER NOT NULL,
    PRIMARY KEY (playlist_id, track_id),
    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS playlist_entries (
    id TEXT PRIMARY KEY, playlist_id TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('local', 'web')), ref_key TEXT NOT NULL,
    track_id TEXT, video_id TEXT, title TEXT NOT NULL, artist TEXT NOT NULL,
    album TEXT NOT NULL DEFAULT '', cover TEXT, position INTEGER NOT NULL,
    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    UNIQUE (playlist_id, ref_key)
);
CREATE INDEX IF NOT EXISTS idx_dv_playlist_entries_order
    ON playlist_entries(playlist_id, position);
CREATE TABLE IF NOT EXISTS doomvault_schema_state (
    key TEXT PRIMARY KEY, value TEXT NOT NULL
);
