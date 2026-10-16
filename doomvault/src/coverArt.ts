
import type { Album } from "./data";

const CACHE_KEY = "doomvault-cover-cache";

type CoverCache = Record<string, string>;

type ItunesResult = {
    collectionName?: string;
    artistName?: string;
    releaseDate?: string;
    artworkUrl100?: string;
};

type MusicBrainzRelease = {
    id: string;
    title: string;
    date?: string;
    "artist-credit"?: {
        name?: string;
        artist?: { name?: string };
    }[];
};

type CoverArtResponse = {
    images?: {
        front?: boolean;
        image?: string;
        thumbnails?: {
            500?: string;
        };
    }[];
};

function normalize(value: string): string {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

function readCache(): CoverCache {
    try {
        return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
    } catch {
        return {};
    }
}

function saveCache(cache: CoverCache): void {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch {
        // A aplicação continua funcionando sem cache.
    }
}

function artistMatches(
    resultArtist: string,
    expectedArtist: string,
): boolean {
    return normalize(resultArtist) === normalize(expectedArtist);
}

function titleMatches(
    resultTitle: string,
    expectedTitle: string,
): boolean {
    const result = normalize(resultTitle);
    const expected = normalize(expectedTitle);

    // Aceita pequenas variações no título, mas evita
    // confundir álbuns diferentes com nomes semelhantes.
    return result === expected;
}

function yearMatches(
    releaseDate: string | undefined,
    expectedYear: number,
): boolean {
    if (!releaseDate) return false;

    return Number(releaseDate.slice(0, 4)) === expectedYear;
}

async function searchItunes(
    album: Album,
): Promise<string | undefined> {
    const params = new URLSearchParams({
        term: `${album.title} ${album.artist}`,
        entity: "album",
        limit: "50",
    });

    const response = await fetch(
        `https://itunes.apple.com/search?${params.toString()}`,
    );

    if (!response.ok) return undefined;

    const data: { results: ItunesResult[] } =
        await response.json();

    const candidates = data.results.filter(
        (item) =>
            item.collectionName &&
            item.artistName &&
            item.artworkUrl100 &&
            titleMatches(item.collectionName, album.title) &&
            artistMatches(item.artistName, album.artist),
    );

    // Dá preferência à edição lançada no ano original.
    candidates.sort((a, b) => {
        const aYear = yearMatches(a.releaseDate, album.year);
        const bYear = yearMatches(b.releaseDate, album.year);

        return Number(bYear) - Number(aYear);
    });

    return candidates[0]?.artworkUrl100?.replace(
        /100x100bb/,
        "600x600bb",
    );
}

async function searchMusicBrainz(
    album: Album,
): Promise<string | undefined> {
    const query =
        `release:"${album.title}" AND artist:"${album.artist}"`;

    const params = new URLSearchParams({
        query,
        fmt: "json",
        limit: "25",
    });

    const response = await fetch(
        `https://musicbrainz.org/ws/2/release/?${params.toString()}`,
    );

    if (!response.ok) return undefined;

    const data: { releases?: MusicBrainzRelease[] } =
        await response.json();

    const releases = (data.releases ?? []).filter((release) => {
        const artists = (release["artist-credit"] ?? [])
            .map(
                (credit) =>
                    credit.name ?? credit.artist?.name ?? "",
            )
            .join(" ");

        return (
            titleMatches(release.title, album.title) &&
            artistMatches(artists, album.artist)
        );
    });

    releases.sort((a, b) => {
        const aYear = Number(a.date?.slice(0, 4)) || 0;
        const bYear = Number(b.date?.slice(0, 4)) || 0;

        return (
            Math.abs(aYear - album.year) -
            Math.abs(bYear - album.year)
        );
    });

    for (const release of releases) {
        try {
            const response = await fetch(
                `https://coverartarchive.org/release/${release.id}`,
            );

            if (!response.ok) continue;

            const data: CoverArtResponse = await response.json();

            const frontCover = data.images?.find(
                (image) =>
                    image.front &&
                    (image.thumbnails?.[500] || image.image),
            );

            const url =
                frontCover?.thumbnails?.[500] ??
                frontCover?.image;

            if (url) return url;
        } catch {
            // Continua tentando outros lançamentos.
        }
    }

    return undefined;
}

export async function findAlbumCover(
    album: Album,
): Promise<string | undefined> {
    const cache = readCache();

    if (cache[album.id]) {
        return cache[album.id];
    }

    let url: string | undefined;

    try {
        url = await searchItunes(album);
    } catch {
        // Tenta a próxima fonte.
    }

    if (!url) {
        try {
            url = await searchMusicBrainz(album);
        } catch {
            // Nenhuma capa encontrada.
        }
    }

    if (url) {
        cache[album.id] = url;
        saveCache(cache);
    }

    return url;
}