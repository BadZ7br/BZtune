import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Disc3, UserRound } from "lucide-react";

export type ArtworkProps = {
  src?: string | null;
  title: string;
  kind?: "artist" | "release" | "song";
  className?: string;
};

/** Shared loading/failure behavior; callers retain their own layout and labels. */
export function ArtworkImage({src, alt, fallback}: {src?: string | null; alt: string; fallback: ReactNode}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  useEffect(() => setFailedSource(null), [src]);
  return src && src !== failedSource
    ? <img key={src} src={src} alt={alt} loading="lazy" onError={() => setFailedSource(src)} />
    : <>{fallback}</>;
}

/** Render an already resolved image URL with the same fallback in every area. */
export default function Artwork({ src, title, kind = "song", className = "" }: ArtworkProps) {
  return <span className={`bz-safe-artwork ${className}`} title={title}>
    <ArtworkImage src={src} alt={kind === "artist" ? `Foto de ${title}` : `Capa: ${title}`} fallback={
      <span className="bz-safe-fallback" role="img"
          aria-label={kind === "artist" ? `Foto indisponível: ${title}` : `Capa indisponível: ${title}`}>
          {kind === "artist" ? <UserRound size={22} /> : <Disc3 size={22} />}
      </span>} />
  </span>;
}
