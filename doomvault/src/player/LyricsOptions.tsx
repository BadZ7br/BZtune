import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { LoaderCircle, MoreHorizontal } from "lucide-react";

/** Native disclosure with predictable dismissal, without taking over player shortcuts. */
export default function LyricsOptions({ busy, children }: { busy: boolean; children: ReactNode }) {
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function placeMenu() {
      const element = details.current;
      const menu = element?.querySelector<HTMLElement>(".bz-lyrics-options-menu");
      if (!element?.open || !menu) return;
      const anchor = element.getBoundingClientRect();
      const panel = element.closest(".bz-lyrics-panel")?.getBoundingClientRect();
      const workspace = element.closest(".bz-player-workspace-body")?.getBoundingClientRect();
      const top = Math.max(8, workspace?.top ?? 8, panel?.top ?? 8);
      const bottom = Math.min(window.innerHeight - 8, workspace?.bottom ?? window.innerHeight - 8, panel?.bottom ?? window.innerHeight - 8);
      if (anchor.bottom < top || anchor.top > bottom) { element.open = false; return; }
      menu.style.width = `${Math.max(0, Math.min(360, (panel?.width ?? window.innerWidth) - 24, window.innerWidth - 48))}px`;
      const below = Math.max(0, bottom - anchor.bottom - 8);
      const above = Math.max(0, anchor.top - top - 8);
      const upwards = below < 220 && above > below;
      menu.style.maxHeight = `${Math.max(0, Math.min(560, upwards ? above : below))}px`;
      menu.style.top = upwards ? "auto" : "calc(100% + 4px)";
      menu.style.bottom = upwards ? "calc(100% + 4px)" : "auto";
    }
    const element = details.current;
    element?.addEventListener("toggle", placeMenu);
    window.addEventListener("resize", placeMenu);
    window.addEventListener("scroll", placeMenu, true);
    function dismissOutside(event: PointerEvent | FocusEvent) {
      const element = details.current;
      if (element?.open && event.target instanceof Node && !element.contains(event.target)) element.open = false;
    }
    function onKeyDown(event: KeyboardEvent) {
      const element = details.current;
      if (event.key !== "Escape" || !element?.open) return;
      event.preventDefault();
      event.stopPropagation();
      element.open = false;
      element.querySelector("summary")?.focus({ preventScroll: true });
    }
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("focusin", dismissOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      element?.removeEventListener("toggle", placeMenu);
      window.removeEventListener("resize", placeMenu);
      window.removeEventListener("scroll", placeMenu, true);
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("focusin", dismissOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);
  return <details className="bz-lyrics-options" ref={details}>
    <summary aria-label="Opções da letra" title="Opções da letra" aria-busy={busy}>
      {busy ? <LoaderCircle size={19} className="bz-lyrics-spinner" /> : <MoreHorizontal size={21} />}
    </summary>
    <div className="bz-lyrics-options-menu">{children}</div>
  </details>;
}
