import { useState } from "react";
import { Music2 } from "lucide-react";

/** Remember a failed source across ordinary player renders; a new URL can load. */
export default function PlayerArtwork({ src, fallbackClassName, size = 18 }: {
  src: string | null; fallbackClassName: string; size?: number;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  return src && failedSource !== src
    ? <img key={src} src={src} alt="" loading="lazy" onError={() => setFailedSource(src)} />
    : <span className={fallbackClassName} aria-hidden="true"><Music2 size={size} /></span>;
}
