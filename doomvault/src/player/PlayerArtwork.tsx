import { ArtworkImage } from "../components/Artwork";
import { Music2 } from "lucide-react";

/** Remember a failed source across ordinary player renders; a new URL can load. */
export default function PlayerArtwork({ src, fallbackClassName, size = 18 }: {
  src: string | null; fallbackClassName: string; size?: number;
}) {
  return <ArtworkImage src={src} alt="" fallback={<span className={fallbackClassName} aria-hidden="true"><Music2 size={size} /></span>} />;
}
