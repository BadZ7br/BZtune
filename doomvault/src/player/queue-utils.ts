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


/** Insere a faixa imediatamente após a atual, reutilizando duplicatas existentes.
 * Retorna o deslocamento para preservar histórico e índices do shuffle.
 */
export function insertNextQueueItem(queue: QueueSnapshot, track: PlayerTrack): {
  queue: QueueSnapshot;
  moved?: { from: number; to: number };
  insertedAt?: number;
} {
  const { tracks, index } = queue;
  if (!tracks.length || index < 0) {
    return { queue: { tracks: [track], index: 0 }, insertedAt: 0 };
  }
  const existing = tracks.findIndex(item =>
    item.videoId === track.videoId && (item.audioUrl || "") === (track.audioUrl || ""));
  if (existing === index) return { queue };
  if (existing >= 0) {
    const to = existing < index ? index : index + 1;
    return { queue: moveQueueItem(queue, existing, to), moved: { from: existing, to } };
  }
  const insertedAt = index + 1;
  const result = [...tracks];
  result.splice(insertedAt, 0, track);
  return { queue: { tracks: result, index }, insertedAt };
}
