import { contracts, readResponse } from "../services/response-contracts";
import { useEffect, useState } from "react";
import { Check, ListPlus, LoaderCircle, X } from "lucide-react";
import { playlists as playlistService, PlaylistError } from "../services/playlists";

type Playlist = { id: string; name: string };
type Props = { trackId: string; title: string; artist: string; showLabel?: boolean };

/** Playlist para MP3/FLAC da biblioteca, usando comandos nativos no Tauri. */
export default function LocalTrackPlaylistButton({ trackId, title, artist, showLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => { setOpen(false); setError(""); setNotice(""); }, [trackId]);

  async function toggle() {
    if (open) { setOpen(false); return; }
    setOpen(true); await loadLists();
  }
  async function loadLists() {
    setBusy(true); setError(""); setNotice("");
    try {
      const data = readResponse<{ playlists: Playlist[] }>(await playlistService.list(), contracts.playlists, "playlists");
      setPlaylists(data.playlists); setError(playlistService.pendingMessage());
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Erro ao listar playlists."); }
    finally { setBusy(false); }
  }

  async function addTo(playlist: Playlist) {
    setBusy(true); setError(""); setNotice("");
    try {
      await playlistService.addTrack(playlist.id, { track_id: trackId });
      setNotice(`Adicionada à playlist “${playlist.name}”.`);
      window.dispatchEvent(new Event("doomvault-playlists-updated"));
    } catch (cause) {
      if (cause instanceof PlaylistError && cause.status === 409 && !cause.uncertain) {
        setNotice(`A música já está na playlist “${playlist.name}”.`);
      } else {
        setError(cause instanceof Error ? cause.message : "Falha ao adicionar a música.");
      }
    }
    finally { setBusy(false); }
  }

  return <span className="dv-pl-add">
    <button type="button" className="dv-pl-add-trigger" title="Adicionar música local à playlist" aria-label={`Adicionar ${title} à playlist`} aria-expanded={open} onClick={() => void toggle()}><ListPlus size={17} />{showLabel && <span>Escolher playlist</span>}</button>
    {open && <span className="dv-pl-popover" role="dialog" aria-label="Escolher playlist">
      <span className="dv-pl-popover-heading"><strong>Adicionar à playlist</strong><button type="button" onClick={() => setOpen(false)} aria-label="Fechar"><X size={15} /></button></span>
      <span className="dv-pl-popover-subtitle">{title} · {artist} · Offline</span>
      {busy && <span className="dv-pl-feedback"><LoaderCircle size={14} /> Processando...</span>}
      {!busy && playlists.length === 0 && !error && <span className="dv-pl-feedback">Cria uma playlist na aba Playlists primeiro.</span>}
      {playlists.map(playlist => <button type="button" key={playlist.id} className="dv-pl-choice" disabled={busy} onClick={() => void addTo(playlist)}><ListPlus size={15} /> {playlist.name}</button>)}
      {error && <span className="dv-pl-error" role="alert">{error}</span>}
      {error && <button type="button" disabled={busy} onClick={() => void loadLists()}>Atualizar playlists</button>}
      {notice && <span className="dv-pl-success" role="status"><Check size={14} />{notice}</span>}
    </span>}
  </span>;
}
