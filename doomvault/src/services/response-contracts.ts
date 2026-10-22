/** Validate wire data before it enters React state. Optional provider metadata stays optional. */
type Check = (value: unknown) => boolean;
export const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text: Check = value => typeof value === "string";
const number: Check = value => typeof value === "number" && Number.isFinite(value);
const nonnegative: Check = value => number(value) && (value as number) >= 0;
const boolean: Check = value => typeof value === "boolean";
const optional = (check: Check): Check => value => value == null || check(value);
const array = (check: Check): Check => value => Array.isArray(value) && value.every(check);
const shape = (required: Record<string, Check>, extras: Record<string, Check> = {}): Check => value => record(value)
  && Object.entries(required).every(([key, check]) => check(value[key]))
  && Object.entries(extras).every(([key, check]) => optional(check)(value[key]));
const names = { id: text, title: text, artist: text };
const album = shape(names, { cover: text, year: value => text(value) || number(value), artist_id: text, release_type: text });
const artist = shape({ name: text }, { id: text, image: text, subscribers: text, description: text });
const webTrack = shape({ title: text }, { video_id: text, videoId: text, artist: text, artists: array(text),
  cover: text, duration: text, duration_seconds: nonnegative, number: nonnegative });
const localTrack = shape({ ...names, audioUrl: text }, { filename: text, bytes: nonnegative, mime: text,
  coverUrl: text, album: text, albumId: text, year: number, trackNumber: number, sourceIds: array(text) });
const localAlbum = shape({ ...names, count: nonnegative, coverUrl: text, hasCover: boolean });
const entry = shape({ ...names, videoId: text, source: value => value === "web" || value === "local" },
  { album: text, cover: text, audioUrl: text, trackId: text });
const playlist = shape({ id: text, name: text, description: text, created_at: text, count: nonnegative, tracks: array(entry) }, { coverUrl: text });
const ranked = shape({ name: text, seconds: nonnegative }, { artist: text, title: text, plays: nonnegative });
const song = shape({ videoId: text, title: text, artist: text }, { album: text, cover: text, duration: text, recommended: boolean });

export const contracts = {
  album: shape({ title: text, tracks: array(webTrack) }, { artist_id: text, year: value => text(value) || number(value), description: text }),
  releases: shape({ results: array(album) }, { count: nonnegative }),
  artists: shape({ results: array(artist) }),
  discography: shape({ albums: array(album) }, { count: nonnegative, sections: value => record(value) && Object.values(value).every(nonnegative), warnings: array(text), complete: boolean, verified_id: boolean }),
  tracks: shape({ tracks: array(localTrack) }),
  localAlbums: shape({ albums: array(localAlbum) }),
  playlists: shape({ playlists: array(playlist) }),
  playlist: shape({ playlist }),
  genres: shape({ genres: array(text) }),
  genre: shape({ id: text, name: text }),
  genreArtists: shape({ artists: array(shape({ id: text, name: text })), count: nonnegative }),
  discovery: shape({}, { songs: array(song), tracks: array(song), albums: array(album),
    artists: array(shape({ id: text, name: text }, { cover: text })), seedArtists: array(text), note: text }),
  summary: shape({ totals: shape({ seconds: nonnegative, plays: nonnegative, tracks: nonnegative, artists: nonnegative }),
    artists: array(ranked), tracks: array(shape({ ...names, seconds: nonnegative }, { plays: nonnegative })),
    albums: array(ranked), daily: array(shape({ day: text, seconds: nonnegative })),
    history: array(shape({ ...names, album: text, source: text, seconds: nonnegative, started_at: text })) }, { thresholdSeconds: nonnegative }),
  wrapped: shape({ year: number, seconds: nonnegative, plays: nonnegative, uniqueArtists: nonnegative,
    topArtists: array(ranked), months: array(shape({ month: text, seconds: nonnegative })) }, { month: number }),
  diagnosis: shape({ python: text, platform: text, sqliteOK: boolean, tracks: nonnegative, libraryPath: text,
    packages: value => record(value) && Object.values(value).every(boolean),
    ffmpeg: value => record(value) && Object.values(value).every(optional(text)) }, { freeBytes: number }),
};

export function readResponse<T>(value: unknown, check: Check, area: string): T {
  if (!check(value)) throw new Error(`Resposta inválida de ${area}. Tente novamente.`);
  return value as T;
}
