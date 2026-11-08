import { API } from "../utils/music-utils";
import Artwork from "../components/Artwork";
import type { ArtworkProps } from "../components/Artwork";

const PROXY = `${API}/api/cover`;
const TRUSTED_COVER = /^(?:[a-z0-9-]+\.)*(?:googleusercontent\.com|mzstatic\.com|coverartarchive\.org|archive\.org)$/i;

type Props = ArtworkProps & { artist?: string };

/** Importante: URLs externas podem expirar ou estar bloqueadas pelo navegador.
 * Para fontes confiáveis, usa o proxy/caching já presente no backend. Nunca exibe
 * o ícone nativo de imagem quebrada: só placeholder acessível e consistente.
 */
export function coverSource(src?: string | null, title?: string, artist?: string, kind?: Props["kind"]): string | null {
  if (!src) {
    if (kind === "release" && title && artist) {
      return `${PROXY}?${new URLSearchParams({title,artist})}`;
    }
    return null;
  }
  try {
    const url = new URL(src);
    if (url.protocol !== "https:" || !url.hostname) return null;
    // Fotos de artistas não são álbuns. Para elas não consulte fallback iTunes.
    if (!TRUSTED_COVER.test(url.hostname)) return url.toString();
    const query = new URLSearchParams({ url: url.toString() });
    if (kind === "release" && title && artist) {
      query.set("title", title);
      query.set("artist", artist);
    }
    return `${PROXY}?${query}`;
  } catch { return null; }
}

export default function SafeArtwork({src,title,artist,kind="song",className=""}: Props) {
  return <Artwork src={coverSource(src,title,artist,kind)} title={title} kind={kind} className={className} />;
}
