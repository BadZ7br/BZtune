import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { createAccentPalette } from "./accent-colors";

export const SETTINGS_KEY = "bztune-settings-v1";
export type Theme = "dark" | "midnight" | "light" | "system";
export type Density = "compact" | "normal" | "spacious";
export type FontSize = "small" | "medium" | "large";
export type Corners = "square" | "soft" | "round";
export type StartPage = "last" | "home" | "explore" | "library" | "system";
export type Preferences = {
  theme: Theme;
  accent: string;
  density: Density;
  fontSize: FontSize;
  corners: Corners;
  transparency: boolean;
  animations: boolean;
  shadows: boolean;
  sidebarGlow: boolean;
  focusRings: boolean;
  autoUpdates: boolean;
  startPage: StartPage;
};
export const DEFAULT_PREFERENCES: Preferences = {
  theme: "dark", accent: "#d1ff63", density: "normal",
  fontSize: "medium", corners: "soft", transparency: true,
  animations: true, shadows: true, sidebarGlow: true, focusRings: true,
  autoUpdates: true, startPage: "last",
};
export const ACCENT_COLORS = [
  "#d1ff63", "#4bd478", "#38cebd", "#66a8ff", "#a78bfa",
  "#ee83cb", "#ff7780", "#ffad55", "#f8d457", "#c1c5c9",
] as const;

function choice<T extends string>(value: unknown, possibilities: readonly T[], fallback: T): T {
  return typeof value === "string" && possibilities.includes(value as T) ? value as T : fallback;
}
export function normalizePreferences(raw: unknown): Preferences {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const color = typeof value.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(value.accent)
    ? value.accent.toLowerCase() : DEFAULT_PREFERENCES.accent;
  return {
    theme: choice(value.theme, ["dark", "midnight", "light", "system"], "dark"),
    accent: color,
    density: choice(value.density, ["compact", "normal", "spacious"], "normal"),
    fontSize: choice(value.fontSize, ["small", "medium", "large"], "medium"),
    corners: choice(value.corners, ["square", "soft", "round"], "soft"),
    transparency: typeof value.transparency === "boolean" ? value.transparency : true,
    animations: typeof value.animations === "boolean" ? value.animations : true,
    shadows: typeof value.shadows === "boolean" ? value.shadows : true,
    sidebarGlow: typeof value.sidebarGlow === "boolean" ? value.sidebarGlow : true,
    focusRings: typeof value.focusRings === "boolean" ? value.focusRings : true,
    autoUpdates: typeof value.autoUpdates === "boolean" ? value.autoUpdates : true,
    startPage: choice(value.startPage, ["last", "home", "explore", "library", "system"], "last"),
  };
}
export function loadPreferences(): Preferences {
  try { return normalizePreferences(JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null")); }
  catch { return { ...DEFAULT_PREFERENCES }; }
}

export function savePreferences(preferences: Preferences): boolean {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(preferences));
    return true;
  } catch {
    return false;
  }
}

export function applyAppearance(preferences: Preferences, systemIsDark: boolean) {
  const root = document.documentElement;
  const theme = preferences.theme === "system" ? (systemIsDark ? "dark" : "light") : preferences.theme;
  root.dataset.bzTheme = theme;
  root.dataset.bzDensity = preferences.density;
  root.dataset.bzFont = preferences.fontSize;
  root.dataset.bzCorners = preferences.corners;
  root.dataset.bzTransparency = String(preferences.transparency);
  root.dataset.bzAnimations = String(preferences.animations);
  root.dataset.bzShadows = String(preferences.shadows);
  root.dataset.bzGlow = String(preferences.sidebarGlow);
  root.dataset.bzFocus = String(preferences.focusRings);
  root.style.setProperty("--lime", preferences.accent);
  const accent = createAccentPalette(preferences.accent, theme);
  root.style.setProperty("--accent-text", accent.text);
  root.style.setProperty("--accent-fill", accent.fill);
  root.style.setProperty("--accent-on-fill", accent.onFill);
  root.style.setProperty("--accent-focus", accent.focus);
  root.style.setProperty("--accent-soft", accent.soft);
  root.style.colorScheme = theme === "light" ? "light" : "dark";
}

type AppearanceValue = {
  preferences: Preferences;
  saveError: boolean;
  retrySave: () => boolean;
  update: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  resetAppearance: () => void;
};
const Appearance = createContext<AppearanceValue | null>(null);
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(loadPreferences);
  const [saveError, setSaveError] = useState(false);
  const [systemIsDark, setSystemIsDark] = useState(() =>
    typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)").matches : true
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => setSystemIsDark(event.matches);
    setSystemIsDark(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    applyAppearance(preferences, systemIsDark);
  }, [preferences, systemIsDark]);

  const retrySave = useCallback(() => {
    const saved = savePreferences(preferences);
    setSaveError(!saved);
    return saved;
  }, [preferences]);
  useEffect(() => {
    retrySave();
  }, [retrySave]);
  const update = <K extends keyof Preferences>(key: K, value: Preferences[K]) =>
    setPreferences(current => normalizePreferences({ ...current, [key]: value }));
  const resetAppearance = () => setPreferences(current => ({ ...current,
    theme: DEFAULT_PREFERENCES.theme, accent: DEFAULT_PREFERENCES.accent,
    density: DEFAULT_PREFERENCES.density, fontSize: DEFAULT_PREFERENCES.fontSize,
    corners: DEFAULT_PREFERENCES.corners, transparency: DEFAULT_PREFERENCES.transparency,
    animations: DEFAULT_PREFERENCES.animations, shadows: DEFAULT_PREFERENCES.shadows,
    sidebarGlow: DEFAULT_PREFERENCES.sidebarGlow, focusRings: DEFAULT_PREFERENCES.focusRings,
  }));
  const context = useMemo(() => ({ preferences, update, resetAppearance, saveError, retrySave }), [preferences, saveError, retrySave]);
  return <Appearance.Provider value={context}>{children}</Appearance.Provider>;
}
export function useAppearance() {
  const context = useContext(Appearance);
  if (!context) throw new Error("As configurações precisam de AppearanceProvider");
  return context;
}
