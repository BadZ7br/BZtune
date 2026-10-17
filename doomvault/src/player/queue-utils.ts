import type { PlayerTrack } from "./PlayerContext";

export type QueueSnapshot = { tracks: PlayerTrack[]; index: number };

export function moveQueueItem(queue: QueueSnapshot, from: number, to: number): QueueSnapshot {
  const { tracks, index } = queue;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= tracks.length || to >= tracks.length || from === to) return queue;
  const reordered = [...tracks];
  const [moved] = reordered.splice(from, 1);
  reordered.splice(to, 0, moved);
  const current = index === from ? to : from < index && to >= index ? index - 1 : from > index && to <= index ? index + 1 : index;
  return { tracks: reordered, index: current };
}

export function removeQueueItem(queue: QueueSnapshot, at: number): QueueSnapshot {
  const { tracks, index } = queue;
  if (!Number.isInteger(at) || at < 0 || at >= tracks.length) return queue;
  const remaining = tracks.filter((_, i) => i !== at);
  if (!remaining.length) return { tracks: [], index: -1 };
  const current = at < index ? index - 1 : at === index ? Math.min(index, remaining.length - 1) : index;
  return { tracks: remaining, index: current };
}

// Permite preservar o histórico do Shuffle/Previous depois de mover uma faixa.
export function remapMovedIndex(at: number, from: number, to: number): number {
  if (at === from) return to;
  if (from < to && at > from && at <= to) return at - 1;
  if (from > to && at >= to && at < from) return at + 1;
  return at;
}
