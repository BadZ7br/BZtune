import { CheckCircle2, HardDriveDownload, MonitorPlay } from "lucide-react";
import type { PlayerTrack } from "../player/PlayerContext";
import {
  confirmedLocalMatch, matchLocalTracks, withLocalSource, withOnlineSource,
  type AvailableLocalTrack,
} from "./library-availability";

type Props = {
  track: PlayerTrack;
  library: readonly AvailableLocalTrack[];
  onPlay: (selected: PlayerTrack) => void;
  compact?: boolean;
};
/** Não altera a fila ou a playlist: só escolhe a fonte da reprodução atual. */
export default function LibrarySourceActions({ track, library, onPlay, compact = false }: Props) {
  const matches = matchLocalTracks(track, library);
  if (!matches.length) return null;
  const certain = confirmedLocalMatch(matches);
  const one = matches.length === 1 ? matches[0] : null;
  return <div className={`bz-hybrid ${compact ? "bz-hybrid-compact" : ""}`}>
    <span className={`bz-hybrid-badge ${certain ? "bz-hybrid-confirmed" : "bz-hybrid-probable"}`}
      title={certain ? "Arquivo local identificado pelo ID de origem ou pelo álbum" : "Mesmo título e artista. Confere a versão antes de reproduzir."}>
      <CheckCircle2 size={13} />{certain ? "Offline disponível" : "Possível cópia local"}
    </span>
    {one ? <button type="button" className="bz-hybrid-play" onClick={() => onPlay(withLocalSource(track, one.track))}
      title={`Tocar arquivo: ${one.track.filename || one.track.title}`}><HardDriveDownload size={14} /> Local</button>
      : <select className="bz-hybrid-pick" defaultValue="" aria-label={`Escolher versão local de ${track.title}`}
        onChange={e => { const selected = matches.find(m => m.track.id === e.target.value); if (selected) onPlay(withLocalSource(track, selected.track)); e.currentTarget.value = ""; }}>
        <option value="">Escolher versão local...</option>
        {matches.map(match => <option key={match.track.id} value={match.track.id}>
          {match.track.album || "Álbum desconhecido"} — {match.track.filename || match.track.title}
        </option>)}
      </select>}
    <button type="button" className="bz-hybrid-play" onClick={() => onPlay(withOnlineSource(track))}>
      <MonitorPlay size={14} /> Online
    </button>
  </div>;
}
