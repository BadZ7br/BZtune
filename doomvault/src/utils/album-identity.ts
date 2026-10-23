/** Accent-insensitive Latin comparison without erasing other writing systems. */
export function normalizeAlbumName(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("pt-BR").normalize("NFD")
    .replace(/(\p{Script=Latin})\p{M}+/gu, "$1").normalize("NFC")
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, " ").trim();
}
/** Provider IDs identify editions; artist/title similarity never merges records. */
export function uniqueAlbums<T extends { id: string; title: string }>(albums: T[]): T[] {
  const seen = new Set<string>();
  return albums.filter(album => {
    if (!album.id || !album.title || seen.has(album.id)) return false;
    seen.add(album.id); return true;
  });
}
