/**
 * Preferences persist only when storage really works. Opaque-origin iframes
 * (sandbox without allow-same-origin) throw on the mere `localStorage` access,
 * so every touch is wrapped and failures fall back to memory.
 */
const KEY = 'frog-blast:prefs:v1';

export interface Prefs { muted: boolean; volume: number; difficulty: 'easy' | 'normal'; versusBots: boolean }
export const defaults: Prefs = { muted: false, volume: 0.7, difficulty: 'normal', versusBots: false };

function store(): Storage | null {
  try {
    const s = window.localStorage;
    const probe = '__fb_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export const storageAvailable = () => store() !== null;

export function loadPrefs(): Prefs {
  const s = store();
  if (!s) return { ...defaults };
  try {
    const raw = JSON.parse(s.getItem(KEY) ?? '{}') as Partial<Prefs>;
    return {
      muted: typeof raw.muted === 'boolean' ? raw.muted : defaults.muted,
      volume: typeof raw.volume === 'number' && raw.volume >= 0 && raw.volume <= 1 ? raw.volume : defaults.volume,
      difficulty: raw.difficulty === 'easy' ? 'easy' : 'normal',
      versusBots: raw.versusBots === true,
    };
  } catch {
    return { ...defaults };
  }
}

export function savePrefs(p: Prefs): boolean {
  const s = store();
  if (!s) return false;
  try { s.setItem(KEY, JSON.stringify(p)); return true; } catch { return false; }
}
