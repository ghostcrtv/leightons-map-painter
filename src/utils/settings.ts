/**
 * Small preferences (tutorial seen, labels on/off) in localStorage.
 * Saved WORLDS will use IndexedDB (Phase 6) — this is only for tiny settings.
 * Every access is wrapped: private browsing or blocked storage must never break the game.
 */
const PREFIX = 'lmp.v1.';

export function readSetting<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeSetting<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable — the setting just won't be remembered */
  }
}
