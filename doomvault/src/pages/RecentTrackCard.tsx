import { useCallback, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Disc3, ListPlus, MoreVertical, Play, SkipForward } from "lucide-react";
import { fullUrl, type StoredTrack } from "../utils/music-utils";

type Props = { track: StoredTrack; onPlay: () => void; onNext: () => void; onQueue: () => void };

export default function RecentTrackCard({ track, onPlay, onNext, onQueue }: Props) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const initialItem = useRef(0);
  const menuId = useId();
  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  }, []);

  useLayoutEffect(() => {
    if (!open || !menu.current || !trigger.current) return;
    const popup = menu.current;
    const position = () => {
      if (!trigger.current) return;
      const anchor = trigger.current.getBoundingClientRect();
      if (anchor.bottom < 0 || anchor.top > window.innerHeight) { close(); return; }
      const { width, height } = popup.getBoundingClientRect();
      const below = anchor.bottom + 6;
      popup.style.left = `${Math.max(8, Math.min(anchor.right - width, window.innerWidth - width - 8))}px`;
      popup.style.top = `${Math.max(8, Math.min(below + height <= window.innerHeight - 8 ? below : anchor.top - height - 6, window.innerHeight - height - 8))}px`;
    };
    position();
    const items = popup.querySelectorAll<HTMLButtonElement>("[role=menuitem]");
    items[initialItem.current === -1 ? items.length - 1 : 0]?.focus({ preventScroll: true });

    const outside = (event: Event) => {
      if (event.target instanceof Node && !popup.contains(event.target) && !trigger.current?.contains(event.target)) close();
    };
    const scroll = (event: Event) => {
      if (!(event.target instanceof Node) || !popup.contains(event.target)) position();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", position);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", position);
    };
  }, [open, close]);

  const navigateMenu = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation(); close(true);
    } else if (event.key === "Tab") {
      close(true);
    } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") || []);
      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
        : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    }
  };

  return <div className="bz-home-track">
    <button type="button" className="dv-home-tile" aria-label={`Reproduzir ${track.title}`} onClick={onPlay}>
      <div className="dv-home-tile-art">{track.coverUrl
        ? <img src={fullUrl(track.coverUrl)} alt="" onError={event => event.currentTarget.style.display = "none"} />
        : <Disc3 size={30} />}</div>
      <span><strong title={track.title}>{track.title}</strong><small title={track.artist}>{track.artist}</small></span>
      <Play size={18} aria-hidden="true" />
    </button>
    <button ref={trigger} type="button" className="bz-home-menu-trigger" aria-label={`Mais opções de ${track.title}`}
      title="Mais opções" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
      onClick={() => { initialItem.current = 0; setOpen(value => !value); }}
      onKeyDown={event => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault(); initialItem.current = event.key === "ArrowUp" ? -1 : 0; setOpen(true);
        }
      }}><MoreVertical size={20} aria-hidden="true" /></button>
    {open && createPortal(<div ref={menu} id={menuId} className="bz-home-track-menu" role="menu"
      aria-label={`Ações de ${track.title}`} onKeyDown={navigateMenu}>
      <button type="button" role="menuitem" onClick={() => { close(true); onNext(); }} aria-label={`Tocar ${track.title} a seguir`}>
        <SkipForward size={18} aria-hidden="true" /><span>Tocar a seguir</span>
      </button>
      <button type="button" role="menuitem" onClick={() => { close(true); onQueue(); }} aria-label={`Adicionar ${track.title} ao fim da fila`}>
        <ListPlus size={18} aria-hidden="true" /><span>Adicionar à fila</span>
      </button>
    </div>, document.body)}
  </div>;
}
