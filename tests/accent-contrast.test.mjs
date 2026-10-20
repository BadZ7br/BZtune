import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(new URL("../doomvault/package.json", import.meta.url));
const ts = require("typescript");
const compiled = ts.transpileModule(readFileSync(new URL("../doomvault/src/settings/accent-colors.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const exports = {};
vm.runInNewContext(compiled, { exports });
const { createAccentPalette } = exports;

// Reference WCAG calculation, separate from the application's implementation.
function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4));
  return channels.reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0);
}
function ratio(first, second) {
  const values = [luminance(first), luminance(second)].sort((a, b) => a - b);
  return (values[1] + 0.05) / (values[0] + 0.05);
}
const surfaces = {
  light: ["#ffffff", "#f3f5f4", "#eef1ef", "#ecf1eb", "#d7ebd7", "#deebdf", "#e2ebe3"],
  dark: ["#101010", "#151515", "#1a1a1a", "#333333", "#254c2c"],
  midnight: ["#09121f", "#111e2c", "#182536", "#333333", "#254c2c"],
};
const accents = ["#d1ff63", "#4bd478", "#38cebd", "#66a8ff", "#a78bfa", "#ee83cb", "#ff7780", "#ffad55", "#f8d457", "#c1c5c9",
  "#000000", "#ffffff", "#808080", "#ff0000", "#00ff00", "#0000ff"];

for (const theme of Object.keys(surfaces)) {
  test(`${theme}: preset and custom colors keep text, controls and focus legible`, () => {
    const sampled = Array.from({ length: 300 }, (_, index) => `#${((index * 104729) % 0x1000000).toString(16).padStart(6, "0")}`);
    for (const accent of [...accents, ...sampled]) {
      const palette = createAccentPalette(accent, theme);
      for (const background of [...surfaces[theme], palette.soft]) {
        assert.ok(ratio(palette.text, background) >= 4.5, `${accent} text on ${background}`);
        assert.ok(ratio(palette.focus, background) >= 3, `${accent} focus on ${background}`);
        assert.ok(ratio(palette.fill, background) >= 3, `${accent} control on ${background}`);
      }
      assert.ok(ratio(palette.onFill, palette.fill) >= 4.5, `${accent} text on filled control`);
    }
  });
}
test("the default dark accent is preserved when it already has sufficient contrast", () => {
  assert.equal(createAccentPalette("#d1ff63", "dark").text, "#d1ff63");
  assert.equal(createAccentPalette("#d1ff63", "light").onFill, "#ffffff");
});
test("black and white custom colors stay usable on both theme extremes", () => {
  assert.equal(createAccentPalette("#000000", "light").text, "#000000");
  assert.equal(createAccentPalette("#ffffff", "dark").text, "#ffffff");
  assert.notEqual(createAccentPalette("#000000", "dark").text, "#000000");
  assert.notEqual(createAccentPalette("#ffffff", "light").text, "#ffffff");
});
test("malformed colors cannot produce NaN or invalid CSS tokens", () => {
  for (const invalid of ["red", "#fff", "#gggggg", "#12345678", ""]) assert.throws(() => createAccentPalette(invalid, "light"));
});
