import { Heart, LibraryBig, Check, Plus } from "lucide-react";
import { usePlayer } from "./PlayerContext";
import type { MusicAlbum } from "../services/api";

type Props = { albums: MusicAlbum[]; favorites: string[]; collection: string[]; onFavorite: (album: MusicAlbum) => void; onCollect: (album: MusicAlbum) => void };
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");

/** Reuses album IDs and the library's existing save operations. */
export default function PlayerAlbumActions({ albums, favorites, collection, onFavorite, onCollect }: Props) {
  const { current } = usePlayer();
  const album = current?.album ? albums.find(item => normalize(item.title) === normalize(current.album!) && normalize(item.artist) === normalize(current.artist)) : undefined;
  return <>
    <div className="bz-player-action-card"><div><Heart size={22} /><strong>Favoritos</strong><p>{album ? `Álbum: ${album.title}` : "Abra o álbum na biblioteca ou na busca para identificá-lo."}</p></div><button type="button" className="bz-player-secondary-action" disabled={!album} aria-pressed={Boolean(album && favorites.includes(album.id))} onClick={() => album && onFavorite(album)}>{album && favorites.includes(album.id) ? <><Check size={16} /> Favoritado</> : <><Plus size={16} /> Favoritar álbum</>}</button></div>
    <div className="bz-player-action-card"><div><LibraryBig size={22} /><strong>Coleção</strong><p>Guarde o álbum junto dos seus outros discos.</p></div><button type="button" className="bz-player-secondary-action" disabled={!album} aria-pressed={Boolean(album && collection.includes(album.id))} onClick={() => album && onCollect(album)}>{album && collection.includes(album.id) ? <><Check size={16} /> Na coleção</> : <><Plus size={16} /> Adicionar álbum</>}</button></div>
  </>;
}
