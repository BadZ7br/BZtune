type RGB = readonly [number, number, number];
export type ResolvedTheme = "dark" | "midnight" | "light";

const SURFACES: Record<ResolvedTheme, readonly string[]> = {
  dark: ["#101010", "#151515", "#1a1a1a", "#333333", "#254c2c"],
  midnight: ["#09121f", "#111e2c", "#182536", "#333333", "#254c2c"],
  light: ["#f3f5f4", "#ffffff", "#eef1ef", "#ecf1eb", "#d7ebd7", "#deebdf"],
};

function rgb(hex: string): RGB {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
function hex(color: RGB): string {
  return `#${color.map(channel => channel.toString(16).padStart(2, "0")).join("")}`;
}
function blend(color: RGB, target: RGB, amount: number): RGB {
  const channel = (index: number) => Math.round(color[index] + (target[index] - color[index]) * amount);
  return [channel(0), channel(1), channel(2)];
}
function luminance(color: RGB): number {
  const linear = color.map(channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}
function contrast(a: RGB, b: RGB): number {
  const first = luminance(a), second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** Preserve an already legible color; otherwise move toward black or white. */
function readable(color: RGB, surfaces: readonly RGB[], light: boolean): RGB {
  const passes = (candidate: RGB) => surfaces.every(surface => contrast(candidate, surface) >= 4.6);
  if (passes(color)) return color;
  const target: RGB = light ? [0, 0, 0] : [255, 255, 255];
  let low = 0, high = 1;
  for (let index = 0; index < 16; index++) {
    const middle = (low + high) / 2;
    if (passes(blend(color, target, middle))) high = middle;
    else low = middle;
  }
  return blend(color, target, high);
}

export function createAccentPalette(accent: string, theme: ResolvedTheme) {
  if (!/^#[0-9a-f]{6}$/i.test(accent)) throw new Error("Cor de destaque inválida.");
  const original = rgb(accent);
  const surfaces = SURFACES[theme].map(rgb);
  const soft = blend(surfaces[1], original, 0.11);
  const text = readable(original, [...surfaces, soft], theme === "light");
  const black: RGB = [0, 0, 0], white: RGB = [255, 255, 255];
  return {
    text: hex(text),
    fill: hex(text),
    onFill: contrast(black, text) >= contrast(white, text) ? "#000000" : "#ffffff",
    focus: hex(text),
    soft: hex(soft),
  };
}
