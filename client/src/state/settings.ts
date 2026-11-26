import { create } from "zustand";

export type ThemeChoice = "system" | "light" | "dark";

export interface Settings {
  /** Follow the device, or force the whiteboard (light) or chalkboard (dark). */
  theme: ThemeChoice;
  /** Off until the player turns it on: a game should never surprise a classroom with noise. */
  sound: boolean;
  /** Short buzzes on phones that support them. */
  vibration: boolean;
}

const KEY = "stemcharades.settings";
const DEFAULTS: Settings = { theme: "system", sound: false, vibration: true };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULTS;
  } catch {
    return DEFAULTS; // storage blocked: the defaults still work
  }
}

/** The board follows the device unless the player chose one; `data-theme` on <html> overrides the media query. */
export function applyTheme(theme: ThemeChoice): void {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
}

export const useSettings = create<Settings & { set: (patch: Partial<Settings>) => void }>((set, get) => ({
  ...load(),
  set: (patch) => {
    set(patch);
    const { theme, sound, vibration } = get();
    try {
      localStorage.setItem(KEY, JSON.stringify({ theme, sound, vibration }));
    } catch {
      /* not remembered, but still applied for this visit */
    }
    if (patch.theme) applyTheme(patch.theme);
  },
}));
