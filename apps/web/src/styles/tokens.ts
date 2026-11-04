/**
 * CampusConnect Liquid Glass Design Tokens
 * macOS Sequoia / Apple VisionOS Inspired Glassmorphic Design System
 *
 * WCAG AA Contrast Compliant (>= 4.5:1 text/surface ratio across light and dark modes)
 */

export const MIN_TEXT_CONTRAST = 4.5;
export const MIN_TOUCH_TARGET_PX = 44;

export type GlassTierName = "glass" | "glassStrong" | "glassSubtle";
export type RoleName = "admin" | "staff" | "student";

export interface GlassTierDefinition {
  readonly name: GlassTierName;
  readonly bgLight: string;
  readonly bgDark: string;
  readonly blur: string;
  readonly saturate: string;
  readonly backdropFilter: string;
  readonly webkitBackdropFilter: string;
  readonly borderLight: string;
  readonly borderDark: string;
  readonly insetHighlightLight: string;
  readonly insetHighlightDark: string;
  readonly shadowLight: string;
  readonly shadowDark: string;
  readonly fallbackLight: string;
  readonly fallbackDark: string;
}

export const glassTiers: Record<GlassTierName, GlassTierDefinition> = {
  glass: {
    name: "glass",
    bgLight: "rgba(255, 255, 255, 0.72)",
    bgDark: "rgba(20, 20, 32, 0.65)",
    blur: "24px",
    saturate: "180%",
    backdropFilter: "blur(24px) saturate(180%)",
    webkitBackdropFilter: "blur(24px) saturate(180%)",
    borderLight: "1px solid rgba(255, 255, 255, 0.45)",
    borderDark: "1px solid rgba(255, 255, 255, 0.12)",
    insetHighlightLight: "inset 0 1px 0 rgba(255, 255, 255, 0.50)",
    insetHighlightDark: "inset 0 1px 0 rgba(255, 255, 255, 0.15)",
    shadowLight:
      "0 4px 24px -1px rgba(0, 0, 0, 0.06), 0 2px 8px -1px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.40)",
    shadowDark:
      "0 4px 24px -1px rgba(0, 0, 0, 0.45), 0 2px 8px -1px rgba(0, 0, 0, 0.30), inset 0 1px 0 rgba(255, 255, 255, 0.12)",
    fallbackLight: "#ffffff",
    fallbackDark: "#14141e",
  },
  glassStrong: {
    name: "glassStrong",
    bgLight: "rgba(255, 255, 255, 0.88)",
    bgDark: "rgba(18, 18, 28, 0.82)",
    blur: "38px",
    saturate: "180%",
    backdropFilter: "blur(38px) saturate(180%)",
    webkitBackdropFilter: "blur(38px) saturate(180%)",
    borderLight: "1px solid rgba(255, 255, 255, 0.60)",
    borderDark: "1px solid rgba(255, 255, 255, 0.16)",
    insetHighlightLight: "inset 0 1px 0 rgba(255, 255, 255, 0.65)",
    insetHighlightDark: "inset 0 1px 0 rgba(255, 255, 255, 0.20)",
    shadowLight:
      "0 20px 48px -4px rgba(0, 0, 0, 0.14), 0 8px 16px -2px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.65)",
    shadowDark:
      "0 20px 48px -4px rgba(0, 0, 0, 0.65), 0 8px 16px -2px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.16)",
    fallbackLight: "#ffffff",
    fallbackDark: "#101118",
  },
  glassSubtle: {
    name: "glassSubtle",
    bgLight: "rgba(255, 255, 255, 0.45)",
    bgDark: "rgba(255, 255, 255, 0.06)",
    blur: "16px",
    saturate: "150%",
    backdropFilter: "blur(16px) saturate(150%)",
    webkitBackdropFilter: "blur(16px) saturate(150%)",
    borderLight: "1px solid rgba(255, 255, 255, 0.30)",
    borderDark: "1px solid rgba(255, 255, 255, 0.08)",
    insetHighlightLight: "inset 0 1px 0 rgba(255, 255, 255, 0.35)",
    insetHighlightDark: "inset 0 1px 0 rgba(255, 255, 255, 0.10)",
    shadowLight:
      "0 2px 8px -1px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.35)",
    shadowDark:
      "0 2px 8px -1px rgba(0, 0, 0, 0.30), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
    fallbackLight: "#f1f5f9",
    fallbackDark: "#182234",
  },
} as const;

export const appleRadii = {
  sm: 8,
  btn: 12,
  input: 12,
  cardSm: 16,
  card: 20,
  cardLg: 24,
  modal: 28,
  pill: 9999,
  dock: 9999,
} as const;

export const appleShadows = {
  cardLight:
    "0 4px 24px -1px rgba(0, 0, 0, 0.06), 0 2px 8px -1px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.40)",
  cardDark:
    "0 4px 24px -1px rgba(0, 0, 0, 0.45), 0 2px 8px -1px rgba(0, 0, 0, 0.30), inset 0 1px 0 rgba(255, 255, 255, 0.12)",
  modalLight:
    "0 20px 48px -4px rgba(0, 0, 0, 0.14), 0 8px 16px -2px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.65)",
  modalDark:
    "0 20px 48px -4px rgba(0, 0, 0, 0.65), 0 8px 16px -2px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.16)",
  subtleLight:
    "0 2px 8px -1px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.35)",
  subtleDark:
    "0 2px 8px -1px rgba(0, 0, 0, 0.30), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
  interactiveLight:
    "0 12px 32px -4px rgba(0, 0, 0, 0.10), 0 4px 12px -2px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.60)",
  interactiveDark:
    "0 12px 32px -4px rgba(0, 0, 0, 0.55), 0 4px 12px -2px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.18)",
} as const;

export const appleTypography = {
  fontFamily: {
    sans: '-apple-system, "SF Pro Display", "SF Pro Text", Inter, system-ui, sans-serif',
    mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  },
  letterSpacing: {
    tight: "-0.02em",
    normal: "0em",
    wide: "0.04em",
  },
  fontSize: {
    xs: "11px",
    sm: "13px",
    base: "15px",
    lg: "17px",
    xl: "20px",
    "2xl": "24px",
    "3xl": "30px",
    "4xl": "38px",
    hero: "48px",
  },
  lineHeight: {
    tight: 1.15,
    snug: 1.3,
    normal: 1.5,
    relaxed: 1.6,
  },
} as const;

export const springMotion = {
  easing: "cubic-bezier(0.32, 0.72, 0, 1)",
  smoothEasing: "cubic-bezier(0.25, 0.1, 0.25, 1)",
  durations: {
    fast: "200ms",
    normal: "300ms",
    slow: "400ms",
  },
  durationsMs: {
    fast: 200,
    normal: 300,
    slow: 400,
  },
  transforms: {
    hoverLift: "translateY(-3px) scale(1.008)",
    pressScale: "scale(0.98)",
    dockHover: "scale(1.22)",
  },
} as const;

export interface RoleOrbSet {
  readonly orb1: string;
  readonly orb2: string;
  readonly orb3: string;
  readonly orb4: string;
}

export interface RolePalette {
  readonly name: RoleName;
  readonly label: string;
  readonly accent: string;
  readonly accentHover: string;
  readonly primary: string;
  readonly secondary?: string;
  readonly tertiary?: string;
  readonly glow: string;
  readonly gradient: string;
  readonly surfaceLight: string;
  readonly surfaceDark: string;
  readonly badgeTextLight: string;
  readonly badgeTextDark: string;
  readonly orbsLight: RoleOrbSet;
  readonly orbsDark: RoleOrbSet;
}

export const rolePalettes: Record<RoleName, RolePalette> = {
  admin: {
    name: "admin",
    label: "Administrative Command",
    accent: "#6366f1",
    accentHover: "#4f46e5",
    primary: "#4338ca",
    glow: "rgba(99, 102, 241, 0.35)",
    gradient: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
    surfaceLight: "rgba(99, 102, 241, 0.08)",
    surfaceDark: "rgba(99, 102, 241, 0.16)",
    badgeTextLight: "#312e81",
    badgeTextDark: "#e0e7ff",
    orbsLight: {
      orb1: "rgba(79, 70, 229, 0.55)",
      orb2: "rgba(168, 85, 247, 0.50)",
      orb3: "rgba(59, 130, 246, 0.40)",
      orb4: "rgba(139, 92, 246, 0.35)",
    },
    orbsDark: {
      orb1: "rgba(67, 56, 202, 0.45)",
      orb2: "rgba(126, 34, 206, 0.40)",
      orb3: "rgba(30, 64, 175, 0.35)",
      orb4: "rgba(109, 40, 217, 0.30)",
    },
  },
  staff: {
    name: "staff",
    label: "Staff Resolution Workspace",
    accent: "#0d9488",
    accentHover: "#0f766e",
    primary: "#0f766e",
    glow: "rgba(20, 184, 166, 0.35)",
    gradient: "linear-gradient(135deg, #0d9488 0%, #10b981 100%)",
    surfaceLight: "rgba(13, 148, 136, 0.08)",
    surfaceDark: "rgba(20, 184, 166, 0.16)",
    badgeTextLight: "#044e47",
    badgeTextDark: "#ccfbf1",
    orbsLight: {
      orb1: "rgba(13, 148, 136, 0.55)",
      orb2: "rgba(16, 185, 129, 0.50)",
      orb3: "rgba(6, 182, 212, 0.40)",
      orb4: "rgba(20, 184, 166, 0.35)",
    },
    orbsDark: {
      orb1: "rgba(15, 118, 110, 0.45)",
      orb2: "rgba(4, 120, 87, 0.40)",
      orb3: "rgba(14, 116, 144, 0.35)",
      orb4: "rgba(13, 148, 136, 0.30)",
    },
  },
  student: {
    name: "student",
    label: "Student Identity Portal",
    accent: "#2563eb",
    accentHover: "#1d4ed8",
    primary: "#1d4ed8",
    secondary: "#f97316",
    tertiary: "#ec4899",
    glow: "rgba(37, 99, 235, 0.35)",
    gradient: "linear-gradient(135deg, #2563eb 0%, #f97316 50%, #ec4899 100%)",
    surfaceLight: "rgba(37, 99, 235, 0.08)",
    surfaceDark: "rgba(37, 99, 235, 0.16)",
    badgeTextLight: "#1e3a8a",
    badgeTextDark: "#eff6ff",
    orbsLight: {
      orb1: "rgba(37, 99, 235, 0.55)",
      orb2: "rgba(249, 115, 22, 0.50)",
      orb3: "rgba(236, 72, 153, 0.40)",
      orb4: "rgba(99, 102, 241, 0.35)",
    },
    orbsDark: {
      orb1: "rgba(29, 78, 216, 0.45)",
      orb2: "rgba(194, 65, 12, 0.40)",
      orb3: "rgba(190, 24, 93, 0.35)",
      orb4: "rgba(79, 70, 229, 0.30)",
    },
  },
} as const;

export const themeSurfaces = {
  light: {
    canvas: "#f8fafc",
    surface: "#ffffff",
    textPrimary: "#0f172a",
    textSecondary: "#475569",
    textMuted: "#64748b",
    borderSubtle: "rgba(0, 0, 0, 0.08)",
    borderStrong: "rgba(0, 0, 0, 0.16)",
    focusRing: "#2563eb",
  },
  dark: {
    canvas: "#0b0f19",
    surface: "#12141c",
    textPrimary: "#f8fafc",
    textSecondary: "#cbd5e1",
    textMuted: "#94a3b8",
    borderSubtle: "rgba(255, 255, 255, 0.08)",
    borderStrong: "rgba(255, 255, 255, 0.16)",
    focusRing: "#60a5fa",
  },
} as const;

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const cleanHex = hex.replace("#", "");
  const m = /^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(cleanHex);
  if (m === null) throw new Error(`Invalid hex colour: ${hex}`);
  const [r, g, b] = [m[1], m[2], m[3]].map((h) =>
    channel(parseInt(h ?? "0", 16)),
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export const verifiedContrastPairs: readonly {
  readonly fg: string;
  readonly bg: string;
  readonly label: string;
  readonly ratio: number;
}[] = [
  {
    fg: "#0f172a",
    bg: "#ffffff",
    label: "Primary text on light fallback",
    ratio: 17.85,
  },
  {
    fg: "#0f172a",
    bg: "#f8fafc",
    label: "Primary text on light canvas",
    ratio: 17.06,
  },
  {
    fg: "#334155",
    bg: "#ffffff",
    label: "Secondary text on light glass",
    ratio: 10.35,
  },
  {
    fg: "#475569",
    bg: "#ffffff",
    label: "Muted text on light glass",
    ratio: 7.58,
  },
  {
    fg: "#f8fafc",
    bg: "#14141e",
    label: "Primary text on dark fallback",
    ratio: 17.48,
  },
  {
    fg: "#f8fafc",
    bg: "#0b0f19",
    label: "Primary text on dark canvas",
    ratio: 18.3,
  },
  {
    fg: "#cbd5e1",
    bg: "#14141e",
    label: "Secondary text on dark glass",
    ratio: 12.31,
  },
  {
    fg: "#94a3b8",
    bg: "#14141e",
    label: "Muted text on dark glass",
    ratio: 7.13,
  },
  { fg: "#ffffff", bg: "#4338ca", label: "Admin button text", ratio: 7.9 },
  { fg: "#312e81", bg: "#e0e7ff", label: "Admin badge light", ratio: 9.27 },
  { fg: "#e0e7ff", bg: "#1e1b4b", label: "Admin badge dark", ratio: 12.98 },
  { fg: "#ffffff", bg: "#0f766e", label: "Staff button text", ratio: 5.47 },
  { fg: "#044e47", bg: "#ccfbf1", label: "Staff badge light", ratio: 8.53 },
  { fg: "#ccfbf1", bg: "#134e4a", label: "Staff badge dark", ratio: 8.41 },
  { fg: "#ffffff", bg: "#1d4ed8", label: "Student primary button", ratio: 6.7 },
  {
    fg: "#ffffff",
    bg: "#c2410c",
    label: "Student orange accent button",
    ratio: 5.18,
  },
  { fg: "#1e3a8a", bg: "#eff6ff", label: "Student badge light", ratio: 9.52 },
  { fg: "#eff6ff", bg: "#172554", label: "Student badge dark", ratio: 13.5 },
];

export function getRoleTokens(role?: string): RolePalette {
  if (role === "admin") return rolePalettes.admin;
  if (role === "staff" || role === "staff") return rolePalettes.staff;
  return rolePalettes.student;
}

export function getRoleCssVars(
  role?: string,
  isDark = false,
): Record<string, string> {
  const p = getRoleTokens(role);
  const orbs = isDark ? p.orbsDark : p.orbsLight;
  return {
    "--accent": p.accent,
    "--accent-hover": p.accentHover,
    "--accent-glow": p.glow,
    "--accent-gradient": p.gradient,
    "--accent-surface": isDark ? p.surfaceDark : p.surfaceLight,
    "--orb-1": orbs.orb1,
    "--orb-2": orbs.orb2,
    "--orb-3": orbs.orb3,
    "--orb-4": orbs.orb4,
  };
}

export default {
  glassTiers,
  appleRadii,
  appleShadows,
  appleTypography,
  springMotion,
  rolePalettes,
  themeSurfaces,
  contrastRatio,
  verifiedContrastPairs,
  getRoleTokens,
  getRoleCssVars,
};
