import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
const require = createRequire(new URL("../doomvault/package.json", import.meta.url));
const ts = require("typescript");
function compile(name) {
  return ts.transpileModule(readFileSync(new URL(`../doomvault/src/settings/${name}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
}
const palette = {};
vm.runInNewContext(compile("accent-colors.ts"), { exports: palette });
function load(stored = null, storage = { getItem: () => stored }) {
  const root = { dataset: {}, style: { setProperty(name, value) { this[name] = value; } } };
  const exports = {};
  vm.runInNewContext(compile("AppearanceContext.tsx"), { exports,
    document: { documentElement: root }, localStorage: storage,
    require: name => name === "./accent-colors" ? palette : name === "react" ? { createContext: () => ({}) } : {},
  });
  return { ...exports, root };
}
test("saved light theme and accent apply to the boot screen without React mounting", () => {
  const api = load(JSON.stringify({ theme: "light", accent: "#ffffff", fontSize: "large" }));
  const preferences = api.loadPreferences();
  api.applyAppearance(preferences, true);
  assert.equal(api.root.dataset.bzTheme, "light");
  assert.equal(api.root.dataset.bzFont, "large");
  assert.equal(api.root.style.colorScheme, "light");
  assert.equal(api.root.style["--lime"], "#ffffff");
  assert.notEqual(api.root.style["--accent-text"], "#ffffff");
  assert.equal(preferences.accent, "#ffffff");
});
test("system theme resolves before boot and updates its accessible colors with OS changes", () => {
  const api = load(JSON.stringify({ theme: "system", accent: "#000000" }));
  const preferences = api.loadPreferences();
  api.applyAppearance(preferences, true);
  assert.equal(api.root.dataset.bzTheme, "dark");
  const darkAccent = api.root.style["--accent-text"];
  api.applyAppearance(preferences, false);
  assert.equal(api.root.dataset.bzTheme, "light");
  assert.equal(api.root.style.colorScheme, "light");
  assert.notEqual(api.root.style["--accent-text"], darkAccent);
  assert.equal(preferences.theme, "system");
});
test("switching from light to midnight replaces resolved theme and color scheme", () => {
  const api = load();
  api.applyAppearance(api.normalizePreferences({ theme: "light" }), false);
  api.applyAppearance(api.normalizePreferences({ theme: "midnight" }), false);
  assert.equal(api.root.dataset.bzTheme, "midnight");
  assert.equal(api.root.style.colorScheme, "dark");
});
test("corrupt saved settings still produce a usable default theme before boot", () => {
  const api = load("{broken json");
  api.applyAppearance(api.loadPreferences(), false);
  assert.equal(api.root.dataset.bzTheme, "dark");
  assert.equal(api.root.style["--lime"], "#d1ff63");
});

test("saving reports quota and security failures without interrupting session appearance", () => {
  for (const name of ["QuotaExceededError", "SecurityError"]) {
    const api = load(null, { setItem() { throw Object.assign(new Error("restricted"), { name }); } });
    const preferences = api.normalizePreferences({ theme: "light", accent: "#66a8ff" });
    api.applyAppearance(preferences, true);
    assert.equal(api.savePreferences(preferences), false);
    assert.equal(api.root.dataset.bzTheme, "light");
    assert.equal(api.root.style["--lime"], "#66a8ff");
  }
});

test("retrying saves the latest choices and preserves unrelated stored data", () => {
  const values = new Map([["bztune-settings-v1", JSON.stringify({ theme: "dark" })], ["doomvault-favorites", "keep"]]);
  let blocked = true;
  const api = load(null, {
    getItem: key => values.get(key) ?? null,
    setItem(key, value) { if (blocked) throw new Error("blocked"); values.set(key, value); },
  });
  assert.equal(api.savePreferences(api.normalizePreferences({ theme: "light" })), false);
  assert.equal(JSON.parse(values.get(api.SETTINGS_KEY)).theme, "dark");
  blocked = false;
  const latest = api.normalizePreferences({ theme: "midnight", density: "compact", autoUpdates: false });
  assert.equal(api.savePreferences(latest), true);
  assert.deepEqual(JSON.parse(values.get(api.SETTINGS_KEY)), JSON.parse(JSON.stringify(latest)));
  assert.equal(values.get("doomvault-favorites"), "keep");
});
