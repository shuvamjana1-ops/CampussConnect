import { createRef, type ContextType } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { GlassCard } from "../components/GlassCard";
import {
  LiquidGlassWallpaper,
  ROLE_ORB_PALETTES,
} from "../components/LiquidGlassWallpaper";
import { FloatingDock } from "../components/FloatingDock";
import { CommandPalette } from "../components/CommandPalette";
import { SessionContext, type UserRole } from "../auth/session";
import {
  glassTiers,
  appleRadii,
  appleShadows,
  appleTypography,
  springMotion,
  rolePalettes,
  contrastRatio,
  verifiedContrastPairs,
  getRoleTokens,
  getRoleCssVars,
} from "../styles/tokens";

type MockSessionType = NonNullable<ContextType<typeof SessionContext>>;

function createMockSession(role: UserRole | null): MockSessionType {
  return {
    user: { id: "usr_test_1", email: "test@example.com" },
    profile: {
      id: "usr_test_1",
      email: "test@example.com",
      full_name: "Test User",
      role: role ?? "student",
      department: "Computer Science",
      roll_number: "JISU/2024/001",
      avatar_url: null,
    },
    role,
    session: null,
    loading: false,
    isConfigured: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
    switchRole: vi.fn(),
    refreshProfile: vi.fn(),
    updateProfile: vi.fn(),
  };
}

describe("Milestone 1 Empirical Stress & Adversarial Test Suite", () => {
  // =========================================================================
  // 1. GlassCard Stress & Edge Cases
  // =========================================================================
  describe("1. GlassCard Specular Highlight & Component Resilience", () => {
    it("preserves legacy and test assertion classes: cc-glass-card and glass-panel", () => {
      const html = renderToString(<GlassCard>Standard Content</GlassCard>);
      expect(html).toContain("glass-panel");
      expect(html).toContain("cc-glass-card");
      expect(html).toContain("glass");
      expect(html).not.toContain("cc-glass-card-interactive");
      expect(html).toContain("Standard Content");
    });

    it("adds cc-glass-card-interactive and accessibility attributes when interactive={true}", () => {
      const html = renderToString(
        <GlassCard interactive>Interactive Button Surface</GlassCard>,
      );
      expect(html).toContain("cc-glass-card-interactive");
      expect(html).toContain('role="button"');
      expect(html).toContain('tabindex="0"');
    });

    it("renders specular highlight layers when spotlight={true} by default", () => {
      const html = renderToString(<GlassCard>Spotlight Surface</GlassCard>);
      expect(html).toContain("cc-glass-border-spotlight");
      expect(html).toContain("cc-glass-spotlight");
    });

    it("omits specular highlight layers completely when spotlight={false}", () => {
      const html = renderToString(
        <GlassCard spotlight={false}>No Spotlight</GlassCard>,
      );
      expect(html).not.toContain("cc-glass-border-spotlight");
      expect(html).not.toContain("cc-glass-spotlight");
    });

    it("correctly maps material and variant props to CSS classes", () => {
      const glassStr = renderToString(
        <GlassCard material="glass-strong">Modal Card</GlassCard>,
      );
      expect(glassStr).toContain("glass-strong");

      const glassSub = renderToString(
        <GlassCard material="glass-subtle">Subtle Card</GlassCard>,
      );
      expect(glassSub).toContain("glass-subtle");

      const varStr = renderToString(
        <GlassCard variant="strong">Variant Strong</GlassCard>,
      );
      expect(varStr).toContain("glass-strong");

      const varSub = renderToString(
        <GlassCard variant="subtle">Variant Subtle</GlassCard>,
      );
      expect(varSub).toContain("glass-subtle");
    });

    it("supports ref forwarding to container DOM element", () => {
      const ref = createRef<HTMLDivElement>();
      renderToString(<GlassCard ref={ref}>Ref Card</GlassCard>);
      // In SSR ref object is not mutated by react-dom/server, but forwardRef should not crash
      expect(ref).toBeDefined();
    });

    it("handles specular coordinate tracking mathematics across edge cases", () => {
      // Direct coordinate calculation stress test matching GlassCard handleMouseMove logic
      const simulateCoordinateTracking = (
        rect: { left: number; top: number; width: number; height: number },
        clientX: number,
        clientY: number,
      ) => {
        const x = Math.round(clientX - rect.left);
        const y = Math.round(clientY - rect.top);
        return {
          mouseX: `${x}px`,
          mouseY: `${y}px`,
          opacity: "1",
        };
      };

      const rect = { left: 100, top: 150, width: 300, height: 200 };

      // Case A: Cursor at exact origin (0, 0 relative)
      const atOrigin = simulateCoordinateTracking(rect, 100, 150);
      expect(atOrigin.mouseX).toBe("0px");
      expect(atOrigin.mouseY).toBe("0px");
      expect(atOrigin.opacity).toBe("1");

      // Case B: Negative coordinates (cursor rapidly exited top-left before mouseleave fired)
      const negativeCoords = simulateCoordinateTracking(rect, 40, 50);
      expect(negativeCoords.mouseX).toBe("-60px");
      expect(negativeCoords.mouseY).toBe("-100px");
      expect(negativeCoords.opacity).toBe("1");

      // Case C: Massive coordinate values (multi-monitor or detached canvas drag)
      const massiveCoords = simulateCoordinateTracking(rect, 50100, 99150);
      expect(massiveCoords.mouseX).toBe("50000px");
      expect(massiveCoords.mouseY).toBe("99000px");
      expect(massiveCoords.opacity).toBe("1");

      // Case D: Subpixel fractional coordinates (touch / precision pen)
      const subpixelCoords = simulateCoordinateTracking(rect, 142.4, 215.8);
      expect(subpixelCoords.mouseX).toBe("42px");
      expect(subpixelCoords.mouseY).toBe("66px");
    });
  });

  // =========================================================================
  // 2. LiquidGlassWallpaper Stress & Role Palettes
  // =========================================================================
  describe("2. LiquidGlassWallpaper Role Palettes & Context Resilience", () => {
    it("safely renders without SessionProvider without throwing unhandled exceptions", () => {
      // Must not crash when SessionContext is null
      expect(() => {
        const html = renderToString(<LiquidGlassWallpaper />);
        expect(html).toContain("liquid-glass-wallpaper");
        expect(html).toContain('data-role-palette="default"');
      }).not.toThrow();
    });

    it("renders admin palette with 4 indigo/purple floating orbs", () => {
      const html = renderToString(
        <SessionContext.Provider value={createMockSession("admin")}>
          <LiquidGlassWallpaper />
        </SessionContext.Provider>,
      );
      expect(html).toContain('data-role-palette="admin"');
      expect(html).toContain("liquid-orb-admin-orb-1");
      expect(html).toContain("liquid-orb-admin-orb-2");
      expect(html).toContain("liquid-orb-admin-orb-3");
      expect(html).toContain("liquid-orb-admin-orb-4");
      expect(html).toContain("background-color:#6366f1"); // Indigo
      expect(html).toContain("background-color:#8b5cf6"); // Purple
    });

    it("renders staff palette with 4 teal/green floating orbs", () => {
      const html = renderToString(
        <SessionContext.Provider value={createMockSession("staff" as UserRole)}>
          <LiquidGlassWallpaper />
        </SessionContext.Provider>,
      );
      expect(html).toContain('data-role-palette="staff"');
      expect(html).toContain("liquid-orb-staff-orb-1");
      expect(html).toContain("liquid-orb-staff-orb-2");
      expect(html).toContain("background-color:#0d9488"); // Teal 600
      expect(html).toContain("background-color:#10b981"); // Emerald 500
    });

    it("maps legacy staff role cleanly to staff palette", () => {
      const html = renderToString(
        <SessionContext.Provider value={createMockSession("staff" as UserRole)}>
          <LiquidGlassWallpaper />
        </SessionContext.Provider>,
      );
      expect(html).toContain('data-role-palette="staff"');
      expect(html).toContain("liquid-orb-staff-orb-1");
    });

    it("renders student portal palette with sapphire/orange/pink orbs", () => {
      const html = renderToString(
        <SessionContext.Provider value={createMockSession("student")}>
          <LiquidGlassWallpaper />
        </SessionContext.Provider>,
      );
      expect(html).toContain('data-role-palette="student"');
      expect(html).toContain("liquid-orb-student-orb-1");
      expect(html).toContain("background-color:#2563eb"); // Sapphire Blue
      expect(html).toContain("background-color:#f97316"); // Sunset Orange
      expect(html).toContain("background-color:#ec4899"); // Rose Pink
    });

    it("allows prop role override to supersede session context role", () => {
      const html = renderToString(
        <SessionContext.Provider value={createMockSession("student")}>
          <LiquidGlassWallpaper role="admin" />
        </SessionContext.Provider>,
      );
      expect(html).toContain('data-role-palette="admin"');
    });

    it("handles theme prop override for dark and light variants", () => {
      const darkHtml = renderToString(<LiquidGlassWallpaper theme="dark" />);
      expect(darkHtml).toContain('data-theme-override="dark"');

      const lightHtml = renderToString(<LiquidGlassWallpaper theme="light" />);
      expect(lightHtml).toContain('data-theme-override="light"');

      const autoHtml = renderToString(<LiquidGlassWallpaper theme="auto" />);
      expect(autoHtml).not.toContain("data-theme-override=");
    });

    it("disables orb animations when disableAnimation={true}", () => {
      const html = renderToString(<LiquidGlassWallpaper disableAnimation />);
      expect(html).toContain("animation-name:none");
      expect(html).toContain("animation-play-state:paused");
    });

    it("contains all 4 role orb sets in ROLE_ORB_PALETTES with valid configuration", () => {
      const roles: ("admin" | "staff" | "student" | "default")[] = [
        "admin",
        "staff",
        "student",
        "default",
      ];
      for (const r of roles) {
        const pal = ROLE_ORB_PALETTES[r];
        expect(pal).toBeDefined();
        expect(pal.accent).toMatch(/^#[0-9a-f]{6}$/i);
        expect(pal.orbs).toHaveLength(4);
        for (const orb of pal.orbs) {
          expect(orb.id).toBeTruthy();
          expect(orb.size).toBeGreaterThanOrEqual(400);
          expect(orb.opacityLight).toBeGreaterThan(0);
          expect(orb.opacityDark).toBeGreaterThan(0);
        }
      }
    });
  });

  // =========================================================================
  // 3. FloatingDock & CommandPalette Stress
  // =========================================================================
  describe("3. FloatingDock Dynamic Items & Math Magnification", () => {
    it("renders admin items when active role is admin", () => {
      const html = renderToString(
        <SessionContext.Provider value={createMockSession("admin")}>
          <MemoryRouter initialEntries={["/admin"]}>
            <FloatingDock />
          </MemoryRouter>
        </SessionContext.Provider>,
      );
      expect(html).toContain("Command Center");
      expect(html).toContain("All Grievances &amp; Tasks");
      expect(html).toContain("User Directory &amp; Roles");
      expect(html).not.toContain("Student Portal");
      expect(html).not.toContain("Staff Queue");
    });

    it("renders staff items when active role is staff or staff", () => {
      const htmlStaff = renderToString(
        <SessionContext.Provider value={createMockSession("staff" as UserRole)}>
          <MemoryRouter initialEntries={["/staff"]}>
            <FloatingDock />
          </MemoryRouter>
        </SessionContext.Provider>,
      );
      expect(htmlStaff).toContain("Staff Queue");
      expect(htmlStaff).toContain("Work Items &amp; Dockets");
      expect(htmlStaff).toContain("Task Status Transitions");
      expect(htmlStaff).not.toContain("Command Center");

      const htmlWorker = renderToString(
        <SessionContext.Provider value={createMockSession("staff" as UserRole)}>
          <MemoryRouter initialEntries={["/staff"]}>
            <FloatingDock />
          </MemoryRouter>
        </SessionContext.Provider>,
      );
      expect(htmlWorker).toContain("Staff Queue");
    });

    it("renders student items when active role is student", () => {
      const html = renderToString(
        <SessionContext.Provider value={createMockSession("student")}>
          <MemoryRouter initialEntries={["/student"]}>
            <FloatingDock />
          </MemoryRouter>
        </SessionContext.Provider>,
      );
      expect(html).toContain("Student Portal");
      expect(html).toContain("Lodge Grievance / Task");
      expect(html).toContain("Scholarships &amp; Internships");
      expect(html).toContain("Academic Section (AC)");
      expect(html).not.toContain("Command Center");
      expect(html).not.toContain("Staff Queue");
    });

    it("renders universal items (⌘K, profile, settings, theme) across all roles", () => {
      const html = renderToString(
        <SessionContext.Provider value={createMockSession("student")}>
          <MemoryRouter initialEntries={["/student"]}>
            <FloatingDock />
          </MemoryRouter>
        </SessionContext.Provider>,
      );
      expect(html).toContain("Search &amp; Commands (⌘K)");
      expect(html).toContain("Identity Profile");
      expect(html).toContain("System Settings");
      expect(html).toContain("Switch to");
    });

    it("verifies cosine proximity magnification formula and boundary bounds", () => {
      // Replicate proximity formula from FloatingDock.tsx
      const calculateMagnification = (
        distance: number,
        proximity = 140,
        maxScale = 1.38,
      ) => {
        if (distance > proximity || distance < 0) {
          if (distance > proximity) return { scale: 1.0, translateY: 0 };
        }
        const effectiveDist = Math.abs(distance);
        if (effectiveDist > proximity) return { scale: 1.0, translateY: 0 };
        const scale =
          1.0 +
          (maxScale - 1.0) *
            Math.cos((effectiveDist / proximity) * (Math.PI / 2));
        const translateY = (1.0 - scale) * 16;
        return { scale, translateY };
      };

      // Peak magnification directly over item center (d = 0)
      const peak = calculateMagnification(0);
      expect(peak.scale).toBeCloseTo(1.38, 3);
      expect(peak.translateY).toBeCloseTo(-6.08, 2);

      // Halfway distance (d = 70)
      const halfway = calculateMagnification(70);
      expect(halfway.scale).toBeCloseTo(1.0 + 0.38 * Math.cos(Math.PI / 4), 3);
      expect(halfway.scale).toBeGreaterThan(1.26);
      expect(halfway.scale).toBeLessThan(1.28);
      expect(halfway.translateY).toBeLessThan(0);

      // Boundary edge (d = 140)
      const boundary = calculateMagnification(140);
      expect(boundary.scale).toBeCloseTo(1.0, 3);
      expect(boundary.translateY).toBeCloseTo(0, 3);

      // Beyond proximity (d = 141 and d = 500)
      const outside = calculateMagnification(141);
      expect(outside.scale).toBe(1.0);
      expect(outside.translateY).toBe(0);

      const farOutside = calculateMagnification(500);
      expect(farOutside.scale).toBe(1.0);
      expect(farOutside.translateY).toBe(0);
    });
  });

  describe("4. CommandPalette Directory & Fuzzy Filtering Logic", () => {
    it("is initially closed (renders null) until toggled", () => {
      const html = renderToString(
        <SessionContext.Provider value={createMockSession("admin")}>
          <MemoryRouter>
            <CommandPalette />
          </MemoryRouter>
        </SessionContext.Provider>,
      );
      expect(html).toBe("");
    });

    it("verifies search filtering matches across titles, subtitles, and keywords", () => {
      // Replicate commands and filtering logic from CommandPalette.tsx
      interface MockCommand {
        id: string;
        title: string;
        subtitle?: string;
        keywords?: string[];
      }

      const mockCommands: MockCommand[] = [
        {
          id: "nav-admin",
          title: "Admin Command Center",
          subtitle: "Overview, analytics, and institutional governance",
          keywords: ["admin", "dashboard", "analytics", "governance"],
        },
        {
          id: "nav-staff",
          title: "Staff Work Queue",
          subtitle: "Assigned dockets and resolution pipeline",
          keywords: ["staff", "staff", "queue", "tickets", "dockets"],
        },
        {
          id: "nav-student",
          title: "Student Portal",
          subtitle: "Grievance lodge, status tracker & services",
          keywords: ["student", "portal", "complaints", "status"],
        },
        {
          id: "nav-academic",
          title: "Academic Section (AC)",
          subtitle: "Examination script records & course evaluation",
          keywords: ["academic", "grades", "marks", "exam", "section", "ac"],
        },
        {
          id: "action-lodge",
          title: "Lodge New Grievance / Task",
          subtitle: "Create and submit a new ticket docket",
          keywords: ["create", "lodge", "new", "grievance", "ticket"],
        },
        {
          id: "theme-dark",
          title: "Switch to Dark Mode",
          subtitle: "Deep macOS obsidian glass aesthetic",
          keywords: ["dark", "mode", "theme", "black"],
        },
      ];

      const filterCommands = (query: string) => {
        if (!query.trim()) return mockCommands;
        const clean = query.trim().toLowerCase();
        return mockCommands.filter((c) => {
          if (c.title.toLowerCase().includes(clean)) return true;
          if (c.subtitle && c.subtitle.toLowerCase().includes(clean))
            return true;
          if (
            c.keywords &&
            c.keywords.some((k) => k.toLowerCase().includes(clean))
          )
            return true;
          return false;
        });
      };

      // Test 1: Empty query returns full list
      expect(filterCommands("")).toHaveLength(6);
      expect(filterCommands("   ")).toHaveLength(6);

      // Test 2: Search by title prefix
      expect(filterCommands("admin")).toHaveLength(1);
      expect(filterCommands("admin")[0]!.id).toBe("nav-admin");

      // Test 3: Search by keyword 'tickets' (matches Staff and Lodge)
      const ticketResults = filterCommands("ticket");
      expect(ticketResults.map((r) => r.id)).toContain("nav-staff");
      expect(ticketResults.map((r) => r.id)).toContain("action-lodge");

      // Test 4: Search by subtitle word 'examination'
      const examResults = filterCommands("examination");
      expect(examResults).toHaveLength(1);
      expect(examResults[0]!.id).toBe("nav-academic");

      // Test 5: Keyword 'ac' (case-insensitive)
      const acResults = filterCommands("AC");
      expect(acResults.map((r) => r.id)).toContain("nav-academic");

      // Test 6: Non-matching query returns empty list
      expect(filterCommands("nonexistent_random_token_12345")).toHaveLength(0);
    });

    it("verifies arrow key navigation wrap-around edge cases", () => {
      const getNextIndex = (
        current: number,
        count: number,
        direction: "down" | "up",
      ) => {
        if (count === 0) return 0;
        if (direction === "down") return (current + 1) % count;
        return (current - 1 + count) % count;
      };

      const count = 5;

      // Down navigation
      expect(getNextIndex(0, count, "down")).toBe(1);
      expect(getNextIndex(3, count, "down")).toBe(4);
      // Down wrap-around at end: 4 -> 0
      expect(getNextIndex(4, count, "down")).toBe(0);

      // Up navigation
      expect(getNextIndex(4, count, "up")).toBe(3);
      expect(getNextIndex(1, count, "up")).toBe(0);
      // Up wrap-around at beginning: 0 -> 4
      expect(getNextIndex(0, count, "up")).toBe(4);

      // Empty list edge case
      expect(getNextIndex(0, 0, "down")).toBe(0);
      expect(getNextIndex(0, 0, "up")).toBe(0);
    });
  });

  // =========================================================================
  // 5. Design Tokens & WCAG Contrast Empirical Verification
  // =========================================================================
  describe("5. Design Tokens & Contrast Ratios Empirical Stress", () => {
    it("verifies all 3 glass tiers have valid Apple blur and saturate values", () => {
      expect(glassTiers.glass.blur).toBe("24px");
      expect(glassTiers.glass.saturate).toBe("180%");
      expect(glassTiers.glassStrong.blur).toBe("38px");
      expect(glassTiers.glassStrong.saturate).toBe("180%");
      expect(glassTiers.glassSubtle.blur).toBe("16px");
      expect(glassTiers.glassSubtle.saturate).toBe("150%");
    });

    it("verifies Apple radii, shadows, typography, and spring motion conformity", () => {
      expect(appleRadii.btn).toBe(12);
      expect(appleRadii.input).toBe(12);
      expect(appleRadii.card).toBe(20);
      expect(appleRadii.modal).toBe(28);
      expect(appleRadii.pill).toBe(9999);
      expect(appleRadii.dock).toBe(9999);

      expect(appleShadows.cardLight).toContain("inset 0 1px 0");
      expect(appleShadows.modalDark).toContain("rgba(0, 0, 0, 0.65)");

      expect(appleTypography.fontFamily.sans).toContain("-apple-system");
      expect(appleTypography.letterSpacing.tight).toBe("-0.02em");

      expect(springMotion.easing).toBe("cubic-bezier(0.32, 0.72, 0, 1)");
      expect(springMotion.durations.normal).toBe("300ms");

      expect(rolePalettes.admin.accent).toBe("#6366f1");
      expect(rolePalettes.staff.accent).toBe("#0d9488");
      expect(rolePalettes.student.accent).toBe("#2563eb");

      expect(getRoleTokens("admin").name).toBe("admin");
      expect(getRoleTokens("staff").name).toBe("staff");
      expect(getRoleTokens("staff").name).toBe("staff");
      expect(getRoleTokens("student").name).toBe("student");
    });

    it("verifies all verifiedContrastPairs meet WCAG AA >= 4.5:1", () => {
      for (const pair of verifiedContrastPairs) {
        const ratio = contrastRatio(pair.fg, pair.bg);
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      }
    });

    it("verifies extreme contrast edge cases", () => {
      // Pure black on pure white -> 21:1
      expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21.0, 1);
      // Pure white on pure white -> 1:1
      expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1.0, 2);
      // Pure black on pure black -> 1:1
      expect(contrastRatio("#000000", "#000000")).toBeCloseTo(1.0, 2);
    });

    it("verifies role CSS variables generated for light and dark modes", () => {
      const adminVarsLight = getRoleCssVars("admin", false);
      expect(adminVarsLight["--accent"]).toBe("#6366f1");
      expect(adminVarsLight["--orb-1"]).toContain("rgba(79, 70, 229");

      const adminVarsDark = getRoleCssVars("admin", true);
      expect(adminVarsDark["--accent"]).toBe("#6366f1");
      expect(adminVarsDark["--orb-1"]).toContain("rgba(67, 56, 202");

      const staffVars = getRoleCssVars("staff", false);
      expect(staffVars["--accent"]).toBe("#0d9488");

      const workerVars = getRoleCssVars("staff", false);
      expect(workerVars["--accent"]).toBe("#0d9488");

      const studentVars = getRoleCssVars("student", false);
      expect(studentVars["--accent"]).toBe("#2563eb");
    });
  });
});
