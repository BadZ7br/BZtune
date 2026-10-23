import { contracts, readResponse } from "./response-contracts";
import { apiFetch } from "./api-fetch";

const API_URL = "http://127.0.0.1:5000";
import type { MusicAlbum, MusicArtist } from "../types/music";
export type { MusicAlbum, MusicArtist } from "../types/music";

export type MusicTrack = {
    number: number;
    title: string;
    video_id: string | null;
    duration: string | null;
    duration_seconds: number | null;
    artists: string[];
};

export type AlbumDetails = {
    id: string;
    title: string;
    artists: string[];
    year: string | number | null;
    description: string | null;
    cover: string | null;
    track_count: number;
    tracks: MusicTrack[];
};

async function apiGet<T>(path: string, check: (value: unknown) => boolean, signal?: AbortSignal): Promise<T> {
    const response = await apiFetch(`${API_URL}${path}`, { signal });

    if (!response.ok) {
        throw new Error(
            `Erro na API do BZtune: ${response.status}`
        );
    }

    return readResponse<T>(await response.json(), check, "catálogo");
}

export async function searchAlbums(query: string, signal?: AbortSignal) {
    return apiGet<{
        count: number;
        results: MusicAlbum[];
    }>(
        `/api/albums?q=${encodeURIComponent(query)}`, contracts.releases, signal
    );
}

export async function searchArtists(query: string) {
    return apiGet<{
        count: number;
        results: MusicArtist[];
    }>(
        `/api/artists?q=${encodeURIComponent(query)}`, contracts.artists
    );
}

export async function getArtistAlbums(
    artistId: string,
    artistName: string
) {
    return apiGet<{
        artist: string;
        count: number;
        albums: MusicAlbum[];
        complete: boolean;
    }>(
        `/api/artists/${encodeURIComponent(artistId)}/albums?name=${encodeURIComponent(artistName)}`, contracts.discography
    );
}

export async function getAlbumDetails(albumId: string) {
    return apiGet<AlbumDetails>(
        `/api/albums/${encodeURIComponent(albumId)}`, contracts.album
    );
}
