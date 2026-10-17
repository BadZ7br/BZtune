import { useEffect, useState } from "react";
import { Disc3, UserRound } from "lucide-react";

const PROXY = "http://127.0.0.1:5000/api/cover";
const TRUSTED_COVER = /^(?:[a-z0-9-]+\.)*(?:googleusercontent\.com|mzstatic\.com|coverartarchive\.org|archive\.org)$/i;

type Props = { src?: string | null; title: string; artist?: string; kind?: "artist" | "release" | "song"; className?: string };

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
  const url = coverSource(src,title,artist,kind);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return <span className={`bz-safe-artwork ${className}`} title={title}>
    {url && !failed
      ? <img src={url} alt={kind === "artist" ? `Foto de ${title}` : `Capa: ${title}`} loading="lazy" onError={() => setFailed(true)} />
      : <span className="bz-safe-fallback" role="img" aria-label={kind === "artist" ? `Foto indisponível: ${title}` : `Capa indisponível: ${title}`}>
          {kind === "artist" ? <UserRound size={22}/> : <Disc3 size={22}/>}</span>}
  </span>;
}
