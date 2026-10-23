import { useCallback, useEffect, useRef } from "react";

/** Close the visible inner panel before the player's global Escape handler. */
export function useDismissiblePanel<T extends HTMLElement = HTMLSpanElement>(open: boolean, setOpen: (value: boolean) => void) {
  const rootRef = useRef<T>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dismiss = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, [setOpen]);
  useEffect(() => {
    if (!open) return;
    // A nonmodal selector receives focus without blocking the rest of the player.
    const panel = rootRef.current?.querySelector<HTMLElement>('[role="dialog"],.bz-queue-picker-panel');
    panel?.querySelector<HTMLElement>('input:not(:disabled),button:not(:disabled)')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || !rootRef.current?.getClientRects().length) return;
      event.preventDefault();
      event.stopPropagation();
      dismiss();
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [open, dismiss]);
  return { rootRef, triggerRef, dismiss };
}
