export const STORAGE_KEY = 'cc_institution_logo_v1';
export const EVENT_NAME = 'cc-logo-updated';

export const EMOJI_REGEX = /(\p{Extended_Pictographic}|\p{Emoji_Presentation}|\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDE4F]|\uD83D[\uDE80-\uDEFF]|[\u2600-\u27BF])/u;

/**
 * Checks whether a given string contains any emoji character.
 * Emojis are strictly disallowed in the institution logo section.
 */
export function containsEmoji(str: string): boolean {
  if (!str) return false;
  return EMOJI_REGEX.test(str);
}

export interface PresetIcon {
  readonly id: string;
  readonly name: string;
  readonly svg: string;
}

export const PRESET_ICONS: readonly PresetIcon[] = [
  {
    id: 'jis-crest',
    name: 'JIS University Crest',
    svg: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M32 4L6 16v18c0 16 11 24 26 26 15-2 26-10 26-26V16L32 4z" fill="#0e2a5c" stroke="#f59e0b" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M32 14L16 22v10c0 9 7 15 16 17 9-2 16-8 16-17V22L32 14z" fill="#061530" opacity="0.6"/>
      <circle cx="32" cy="28" r="7" fill="#f59e0b"/>
      <path d="M32 23v10M27 28h10" stroke="#fef08a" stroke-width="2" stroke-linecap="round"/>
      <path d="M22 44c3 3 6 4 10 4s7-1 10-4" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'academic-shield',
    name: 'Excellence Shield',
    svg: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="8" width="48" height="48" rx="14" fill="#0d9488" stroke="#ffffff" stroke-width="2"/>
      <path d="M32 16L18 24l14 8 14-8-14-8z" fill="#fef08a"/>
      <path d="M23 29v11c0 5 4 8 9 8s9-3 9-8V29" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="32" cy="35" r="3" fill="#f59e0b"/>
    </svg>`,
  },
  {
    id: 'tech-poly',
    name: 'Technology Pillar',
    svg: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="32" r="28" fill="#1e3a8a" stroke="#38bdf8" stroke-width="2.5"/>
      <path d="M32 12l15 9v18L32 48 17 39V21l15-9z" fill="#0284c7" stroke="#ffffff" stroke-width="2"/>
      <path d="M32 12v36M17 21l30 18M47 21L17 39" stroke="#93c5fd" stroke-width="1.5"/>
      <circle cx="32" cy="32" r="5" fill="#f59e0b" stroke="#ffffff" stroke-width="1.5"/>
    </svg>`,
  },
];

export const DEFAULT_LOGO_VALUE = '/icon.svg';

let memoryFallback: string | null = null;

/**
 * Returns current logo string from localStorage or memory fallback, or default.
 */
export function getStoredLogo(): string {
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        if (containsEmoji(raw)) {
          window.localStorage.removeItem(STORAGE_KEY);
          return DEFAULT_LOGO_VALUE;
        }
        return raw;
      }
    } catch {
      // fall through to memory fallback
    }
  }
  if (memoryFallback && !containsEmoji(memoryFallback)) {
    return memoryFallback;
  }
  return DEFAULT_LOGO_VALUE;
}

/**
 * Validates and sets the stored institution logo.
 * Disallows any emojis strictly.
 */
export function setStoredLogo(value: string): { ok: boolean; error?: string } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false, error: 'Logo value cannot be empty. Please provide an icon URL, SVG, or upload an image.' };
  }

  if (containsEmoji(trimmed)) {
    return {
      ok: false,
      error: 'Emojis are strictly prohibited as logos. Please provide an image file, SVG vector, or icon URL.',
    };
  }

  try {
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, trimmed);
      if (typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { logo: trimmed } }));
      }
    }
    memoryFallback = trimmed;
    return { ok: true };
  } catch (err) {
    memoryFallback = trimmed;
    return { ok: true };
  }
}

/**
 * Resets the institution logo to default.
 */
export function resetStoredLogo(): void {
  memoryFallback = null;
  try {
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY);
      if (typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { logo: DEFAULT_LOGO_VALUE } }));
      }
    }
  } catch {
    // Ignore storage errors
  }
}
