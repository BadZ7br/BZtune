export type TrackSource = "web" | "local";

export type PlayerTrack = {
  videoId: string;
  title: string;
  artist: string;
  source?: TrackSource;
  cover?: string | null;
  album?: string | null;
  audioUrl?: string;
};

export type RepeatMode = "off" | "all" | "one";

export type MusicAlbum = {
  id: string;
  title: string;
  artist: string;
  artistId?: string | null;
  year: string | number | null;
  cover: string | null;
};

export type MusicArtist = {
  id: string;
  name: string;
  image: string | null;
  subscribers: string | null;
  description: string | null;
};

export type LocalTrack = {
  id: string;
  title: string;
  artist: string;
  filename: string;
  album?: string | null;
  year?: number | null;
  genre?: string | null;
  hasCover?: boolean;
  coverUrl?: string | null;
  audioUrl: string;
  bytes: number;
  mime: string;
  created_at?: string;
};