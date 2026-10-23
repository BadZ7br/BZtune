import { useEffect, useRef } from "react";
import type { RefObject } from "react";

const modalStack: HTMLElement[] = [];
const inertOwners = new WeakMap<HTMLElement, { count: number; original: boolean }>();
const focusSelector = 'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,iframe,[tabindex]:not([tabindex="-1"])';
function focusable(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>(focusSelector)].filter(element =>
    element.tabIndex >= 0 && !element.closest('[inert],[hidden]') && element.getClientRects().length > 0
    && getComputedStyle(element).visibility !== 'hidden');
}
function isolate(root: HTMLElement) {
  const owned: HTMLElement[] = [];
  for (let branch: HTMLElement | null = root; branch?.parentElement && branch !== document.body; branch = branch.parentElement) {
    for (const sibling of branch.parentElement.children) {
      if (!(sibling instanceof HTMLElement) || sibling === branch || sibling.matches('script,style,link,[data-focus-scope-keep]')) continue;
      const state = inertOwners.get(sibling) ?? { count: 0, original: sibling.inert };
      state.count++; inertOwners.set(sibling, state); sibling.inert = true; owned.push(sibling);
    }
  }
  return () => { for (const element of owned) {
    const state = inertOwners.get(element);
    if (state && --state.count === 0) { element.inert = state.original; inertOwners.delete(element); }
  } };
}

/** Manage initial focus, modal Tab containment and restoration without remounting content. */
export function useFocusScope<T extends HTMLElement>(ref: RefObject<T>, active: boolean,
  options: { modal?: boolean; initialFocus?: string; onEscape?: () => void; restoreFocus?: boolean; returnFocus?: () => HTMLElement | null } = {}) {
  const latest = useRef(options); latest.current = options;
  const modal = options.modal ?? true, initialFocus = options.initialFocus;
  useEffect(() => {
    const root = ref.current;
    if (!active || !root) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const release = modal ? isolate(root) : () => {};
    if (modal) modalStack.push(root);
    const initial = initialFocus ? root.querySelector<HTMLElement>(initialFocus) : null;
    (initial && !initial.matches(':disabled') ? initial : focusable(root)[0] ?? root).focus({ preventScroll: true });
    const isTop = () => modalStack[modalStack.length - 1] === root;
    const keydown = (event: KeyboardEvent) => {
      if (!modal || !isTop() || event.defaultPrevented || event.key !== 'Tab') return;
      const items = focusable(root), first = items[0], last = items[items.length - 1];
      if (!first) { event.preventDefault(); root.focus(); }
      else if (event.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    const focusin = (event: FocusEvent) => {
      if (modal && isTop() && event.target instanceof Node && !root.contains(event.target)) (focusable(root)[0] ?? root).focus();
    };
    // Inner nonmodal selectors consume Escape at document before this window listener.
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || (modal && !isTop()) || !latest.current.onEscape) return;
      event.preventDefault(); event.stopPropagation(); latest.current.onEscape();
    };
    document.addEventListener('keydown', keydown);
    document.addEventListener('focusin', focusin);
    window.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('keydown', keydown); document.removeEventListener('focusin', focusin); window.removeEventListener('keydown', escape);
      if (modal) { const index = modalStack.lastIndexOf(root); if (index >= 0) modalStack.splice(index, 1); }
      release();
      const target = latest.current.returnFocus?.() ?? previous;
      if (latest.current.restoreFocus !== false && target?.isConnected && !target.closest('[inert]') && target.getClientRects().length) target.focus({ preventScroll: true });
    };
  }, [active, ref, modal, initialFocus]);
}
