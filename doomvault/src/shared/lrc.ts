export type LyricLine = { time: number; text: string };
export function parseLrc(source: string): LyricLine[] {
  const rows = source.split(/\r\n?|\n/);
  let offsetMs = 0;
  // Offset is metadata only on its own row, never a tag inside the sung text.
  for (const row of rows) {
    const match = row.match(/^\s*\[offset:([+-]?\d+)\]\s*$/i);
    if (match && Number.isFinite(Number(match[1]))) { offsetMs = Number(match[1]); break; }
  }
  const lines: LyricLine[] = [];
  for (const row of rows) {
    let text = row.trimStart();
    const times = new Set<number>();
    // Only leading timestamps are syntax. Brackets elsewhere belong to the lyrics.
    for (;;) {
      const stamp = text.match(/^\[(\d{1,3}):([0-5]\d)(?:\.(\d{1,3}))?\]/);
      if (!stamp) break;
      const ms = Number(stamp[1]) * 60_000 + Number(stamp[2]) * 1000 + Number((stamp[3] || "0").padEnd(3, "0"));
      times.add(Math.max(0, ms - offsetMs));
      text = text.slice(stamp[0].length).trimStart();
    }
    for (const ms of times) lines.push({ time: ms / 1000, text: text.trim() });
  }
  const groups: LyricLine[] = [];
  for (const line of lines.sort((a, b) => a.time - b.time)) {
    const previous = groups[groups.length - 1];
    if (previous?.time === line.time) previous.text += `\n${line.text}`;
    else groups.push({ ...line });
  }
  return groups;
}
