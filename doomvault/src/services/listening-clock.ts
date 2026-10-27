export type ListeningClock = { at: number; playing: boolean };
/** Charge elapsed time to the previous confirmed engine state, never seek distance. */
export function sampleListeningClock(clock: ListeningClock, now: number, playing: boolean): number {
  if (!Number.isFinite(now)) return 0;
  const elapsed = clock.playing ? Math.max(0, (now - clock.at) / 1000) : 0;
  clock.at = now;
  clock.playing = playing;
  return elapsed;
}
