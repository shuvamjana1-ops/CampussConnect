// Design tokens. Every text/background pair below is checked at >= 4.5:1 by `contrastRatio`.
export const MIN_TEXT_CONTRAST = 4.5;
export const MIN_TOUCH_TARGET_PX = 44;

export const colors = {
  text: '#1a1a1a',
  textMuted: '#4a4a4a',
  background: '#ffffff',
  surface: '#f4f5f7',
  border: '#767676',
  focusRing: '#0b57d0',
  primary: '#1d4ed8',
  onPrimary: '#ffffff',
  danger: '#b00020',
  onDanger: '#ffffff',
  infoBg: '#e0ecff',
  onInfo: '#0b2e73',
  successBg: '#dcf5e3',
  onSuccess: '#0b4a1f',
  warningBg: '#fff1c2',
  onWarning: '#5c3d00',
  dangerBg: '#fde3e6',
  onDangerBg: '#7a0014',
  neutralBg: '#e6e8eb',
  onNeutral: '#1a1a1a',
  aiBg: '#ece6ff',
  onAi: '#3b1d8f',
} as const;

/** Pairs of [foreground, background] that carry text and must meet the contrast minimum. */
export const textPairs: readonly (readonly [string, string])[] = [
  [colors.text, colors.background],
  [colors.textMuted, colors.background],
  [colors.text, colors.surface],
  [colors.onPrimary, colors.primary],
  [colors.onDanger, colors.danger],
  [colors.onInfo, colors.infoBg],
  [colors.onSuccess, colors.successBg],
  [colors.onWarning, colors.warningBg],
  [colors.onDangerBg, colors.dangerBg],
  [colors.onNeutral, colors.neutralBg],
  [colors.onAi, colors.aiBg],
];

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const radius = { sm: 4, md: 8, pill: 999 } as const;
export const fontSizes = { sm: 14, md: 16, lg: 20 } as const;
export const touchTarget = { minWidth: MIN_TOUCH_TARGET_PX, minHeight: MIN_TOUCH_TARGET_PX } as const;
export const focusOutline = `3px solid ${colors.focusRing}`;

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (m === null) throw new Error(`Invalid hex colour: ${hex}`);
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => channel(parseInt(h ?? '0', 16))) as [
    number,
    number,
    number,
  ];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 contrast ratio between two #rrggbb colours. */
export function contrastRatio(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Global stylesheet exposing the tokens as CSS variables with focus and touch-target rules. */
export const baseStyles = `
:root {
${Object.entries(colors)
  .map(([k, v]) => `  --cc-color-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${v};`)
  .join('\n')}
  --cc-touch-target: ${String(MIN_TOUCH_TARGET_PX)}px;
}
body { color: var(--cc-color-text); background: var(--cc-color-background); font-size: ${String(fontSizes.md)}px; }
.cc-button, .cc-input, .cc-select, .cc-tab { min-width: ${String(MIN_TOUCH_TARGET_PX)}px; min-height: ${String(MIN_TOUCH_TARGET_PX)}px; }
.cc-button { padding: ${String(spacing.sm)}px ${String(spacing.lg)}px; border-radius: ${String(radius.md)}px; border: 1px solid transparent; background: var(--cc-color-primary); color: var(--cc-color-on-primary); font-size: ${String(fontSizes.md)}px; cursor: pointer; }
.cc-button[data-disabled] { opacity: 0.6; cursor: not-allowed; }
.cc-button[data-variant='secondary'] { background: var(--cc-color-background); color: var(--cc-color-text); border-color: var(--cc-color-border); }
.cc-button[data-variant='danger'] { background: var(--cc-color-danger); color: var(--cc-color-on-danger); }
.cc-input { box-sizing: border-box; padding: ${String(spacing.sm)}px ${String(spacing.md)}px; border: 1px solid var(--cc-color-border); border-radius: ${String(radius.sm)}px; font-size: ${String(fontSizes.md)}px; }
.cc-field-error { color: var(--cc-color-danger); font-size: ${String(fontSizes.sm)}px; }
.cc-field-description { color: var(--cc-color-text-muted); font-size: ${String(fontSizes.sm)}px; }
.cc-badge { display: inline-flex; align-items: center; gap: ${String(spacing.xs)}px; padding: 2px ${String(spacing.sm)}px; border-radius: ${String(radius.pill)}px; font-size: ${String(fontSizes.sm)}px; }
.cc-badge[data-tone='info'] { background: var(--cc-color-info-bg); color: var(--cc-color-on-info); }
.cc-badge[data-tone='success'] { background: var(--cc-color-success-bg); color: var(--cc-color-on-success); }
.cc-badge[data-tone='warning'] { background: var(--cc-color-warning-bg); color: var(--cc-color-on-warning); }
.cc-badge[data-tone='danger'] { background: var(--cc-color-danger-bg); color: var(--cc-color-on-danger-bg); }
.cc-badge[data-tone='neutral'] { background: var(--cc-color-neutral-bg); color: var(--cc-color-on-neutral); }
.cc-badge[data-tone='ai'] { background: var(--cc-color-ai-bg); color: var(--cc-color-on-ai); }
:focus-visible, [data-focus-visible] { outline: ${focusOutline}; outline-offset: 2px; }
`;
