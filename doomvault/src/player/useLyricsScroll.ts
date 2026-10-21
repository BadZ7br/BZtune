import { useLayoutEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import type { LyricLine } from "../services/lyrics";

type ScrollOptions = {
  identity: string;
  lines: LyricLine[];
  plainText: string;
  activeLine: number;
  visible: boolean;
  following: boolean;
  setFollowing: (value: boolean) => void;
};

/** Read-only viewport control: never changes the media clock or playback state. */
export function useLyricsScroll(options: ScrollOptions) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const latest = useRef(options);
  latest.current = options;
  const lastLine = useRef(-1);

  function cancelMotion() {
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollTo({ top: viewport.scrollTop, behavior: "instant" });
  }
  function stopFollowing() {
    latest.current = { ...latest.current, following: false };
    cancelMotion();
    latest.current.setFollowing(false);
  }
  function align(animate: boolean) {
    const viewport = viewportRef.current;
    const { visible, following, activeLine } = latest.current;
    if (!viewport || !visible || !following) return;
    const line = viewport.querySelector<HTMLElement>(".bz-lyric-active");
    if (!line) {
      viewport.scrollTo({ top: 0, behavior: "instant" });
      lastLine.current = -1;
      return;
    }
    const reader = viewport.getBoundingClientRect();
    const bounds = line.getBoundingClientRect();
    // Keep a multi-line translation block fully visible whenever it fits.
    const anchor = Math.max(0, Math.min(viewport.clientHeight * .4, (viewport.clientHeight - bounds.height) / 2));
    const target = bounds.top - reader.top - viewport.clientTop + viewport.scrollTop - anchor;
    const top = Math.max(0, Math.min(target, viewport.scrollHeight - viewport.clientHeight));
    const nearby = Math.abs(activeLine - lastLine.current) <= 1;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    viewport.scrollTo({ top, behavior: animate && nearby && !reducedMotion ? "smooth" : "instant" });
    lastLine.current = activeLine;
  }

  useLayoutEffect(() => {
    // This runs before paint, including plain lyrics and the intro before verse one.
    viewportRef.current?.scrollTo({ top: 0, behavior: "instant" });
    lastLine.current = -1;
    options.setFollowing(true);
  }, [options.identity, options.lines, options.plainText, options.setFollowing]);

  useLayoutEffect(() => {
    if (!options.following) { cancelMotion(); return; }
    align(true);
    // All geometry callbacks read the current model through latest, not a stale clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.visible, options.following, options.activeLine, options.lines, options.plainText, options.identity]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!options.visible || !viewport || !content) return;
    let disposed = false;
    let frame = 0;
    const onLayout = () => {
      if (disposed) return;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => { if (!disposed) align(false); });
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(onLayout);
    observer?.observe(viewport);
    observer?.observe(content);
    window.addEventListener("resize", onLayout);
    document.fonts?.addEventListener("loadingdone", onLayout);
    void document.fonts?.ready.then(onLayout);
    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", onLayout);
      document.fonts?.removeEventListener("loadingdone", onLayout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.visible]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    // Native verse buttons handle Space/Enter; reader navigation still scrolls manually.
    if (event.key === " " && (event.target as HTMLElement).closest("button")) return;
    if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) {
      stopFollowing();
      // Space scrolls the focused reader; it must not trigger the global Play shortcut.
      event.stopPropagation();
    }
  }
  return { viewportRef, contentRef, stopFollowing, onKeyDown };
}
