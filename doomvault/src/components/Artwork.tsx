import { useEffect, useState } from "react";
import { Disc3, UserRound } from "lucide-react";

export type ArtworkProps = {
  src?: string | null;
  title: string;
  kind?: "artist" | "release" | "song";
  className?: string;
};

/** Render an already resolved image URL with the same fallback in every area. */
export default function Artwork({ src, title, kind = "song", className = "" }: ArtworkProps) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return <span className={`bz-safe-artwork ${className}`} title={title}>
    {src && !failed
      ? <img src={src} alt={kind === "artist" ? `Foto de ${title}` : `Capa: ${title}`}
          loading="lazy" onError={() => setFailed(true)} />
      : <span className="bz-safe-fallback" role="img"
          aria-label={kind === "artist" ? `Foto indisponível: ${title}` : `Capa indisponível: ${title}`}>
          {kind === "artist" ? <UserRound size={22} /> : <Disc3 size={22} />}
        </span>}
  </span>;
}
