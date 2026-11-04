import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  ClipboardList,
  Users,
  ShieldCheck,
  CheckCircle2,
  FileText,
  GraduationCap,
  Sparkles,
  BookOpen,
  Search,
  User,
  Settings,
  Sun,
  Moon,
  Ticket,
  Building2,
  Award,
  Bot,
} from "lucide-react";
import { useSession } from "../auth/session";

export interface DockItemConfig {
  id: string;
  label: string;
  icon: React.ReactNode;
  path?: string;
  action?: () => void;
  badge?: string | number;
}

export function FloatingDock() {
  const { role } = useSession();
  const location = useLocation();
  const navigate = useNavigate();

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [mouseX, setMouseX] = useState<number | null>(null);
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      if (typeof window === "undefined") return true;
      const saved =
        typeof localStorage !== "undefined"
          ? localStorage.getItem("campusconnect:theme")
          : null;
      if (saved) return saved === "dark";
      return true;
    } catch {
      return true;
    }
  });

  // Reactive theme synchronization via MutationObserver and custom events
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined")
      return;

    const syncTheme = () => {
      try {
        const isDocDark =
          document.documentElement.getAttribute("data-theme") === "dark" ||
          document.documentElement.classList.contains("dark") ||
          (typeof localStorage !== "undefined" &&
            localStorage.getItem("campusconnect:theme") === "dark");
        setIsDark(Boolean(isDocDark));
      } catch {
        // ignore
      }
    };

    syncTheme();

    const observer = new MutationObserver(() => {
      syncTheme();
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });

    const handleCustomEvent = () => syncTheme();
    window.addEventListener("storage", syncTheme);
    window.addEventListener("campusconnect:theme-changed", handleCustomEvent);

    return () => {
      observer.disconnect();
      window.removeEventListener("storage", syncTheme);
      window.removeEventListener(
        "campusconnect:theme-changed",
        handleCustomEvent,
      );
    };
  }, []);

  const dockRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const activeRole = role ?? "student";

  // Trigger theme toggle
  const handleToggleTheme = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      try {
        if (next) {
          document.documentElement.setAttribute("data-theme", "dark");
          document.documentElement.classList.add("dark");
          localStorage.setItem("campusconnect:theme", "dark");
        } else {
          document.documentElement.removeAttribute("data-theme");
          document.documentElement.classList.remove("dark");
          localStorage.setItem("campusconnect:theme", "light");
        }
        window.dispatchEvent(
          new CustomEvent("campusconnect:theme-changed", {
            detail: { isDark: next },
          }),
        );
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  // Trigger command palette
  const handleOpenCommandPalette = useCallback(() => {
    window.dispatchEvent(new CustomEvent("campusconnect:open-command-palette"));
  }, []);

  // Dynamic Dock Items according to active role
  const items: DockItemConfig[] = [
    // 1. Primary Dashboard
    {
      id: "dashboard",
      label:
        activeRole === "admin"
          ? "Command Center"
          : activeRole === "staff"
            ? "Staff Queue"
            : "Student Portal",
      icon:
        activeRole === "admin" ? (
          <ShieldCheck size={22} />
        ) : activeRole === "staff" ? (
          <CheckCircle2 size={22} />
        ) : (
          <GraduationCap size={22} />
        ),
      path:
        activeRole === "admin"
          ? "/admin"
          : activeRole === "staff"
            ? "/staff"
            : "/student",
    },
    // 2. Role Primary View
    ...(activeRole === "admin"
      ? [
          {
            id: "tasks",
            label: "All Grievances & Tasks",
            icon: <ClipboardList size={22} />,
            path: "/admin?tab=tasks",
          },
          {
            id: "hostel",
            label: "Hostel Gate Pass",
            icon: <Building2 size={22} />,
            path: "/admin?tab=hostel",
          },
          {
            id: "users",
            label: "User Directory & Roles",
            icon: <Users size={22} />,
            path: "/admin?tab=users",
          },
        ]
      : []),
    ...(activeRole === "staff"
      ? [
          {
            id: "submissions",
            label: "Work Items & Dockets",
            icon: <FileText size={22} />,
            path: "/staff?tab=submissions",
          },
          {
            id: "hostel",
            label: "Hostel Gate Pass",
            icon: <Building2 size={22} />,
            path: "/staff?tab=hostel",
          },
          {
            id: "resolution",
            label: "Task Status Transitions",
            icon: <ClipboardList size={22} />,
            path: "/staff?tab=resolution",
          },
        ]
      : []),
    ...(activeRole === "student"
      ? [
          {
            id: "lodge",
            label: "Lodge Grievance / Task",
            icon: <ClipboardList size={22} />,
            path: "/student?tab=lodge",
          },
          {
            id: "hallticket",
            label: "Exam Hall Ticket",
            icon: <Ticket size={22} />,
            path: "/student?tab=hallticket",
          },
          {
            id: "hostel",
            label: "Hostel Gate Pass",
            icon: <Building2 size={22} />,
            path: "/student?tab=hostel",
          },
          {
            id: "certificates",
            label: "E-Certificates",
            icon: <Award size={22} />,
            path: "/student?tab=certificates",
          },
          {
            id: "ai-assistant",
            label: "Campus AI Assistant",
            icon: <Bot size={22} />,
            path: "/student?tab=ai-assistant",
          },
          {
            id: "scholarships",
            label: "Scholarships & Internships",
            icon: <Sparkles size={22} />,
            path: "/student?tab=scholarships",
          },
          {
            id: "academic",
            label: "Academic Section (AC)",
            icon: <BookOpen size={22} />,
            path: "/portal/student/ac",
          },
        ]
      : []),
    // Separator / Universal Actions
    {
      id: "command-palette",
      label: "Search & Commands (⌘K)",
      icon: <Search size={22} />,
      action: handleOpenCommandPalette,
    },
    {
      id: "profile",
      label: "Identity Profile",
      icon: <User size={22} />,
      path: "/profile",
    },
    {
      id: "settings",
      label: "System Settings",
      icon: <Settings size={22} />,
      path: "/settings",
    },
    {
      id: "theme",
      label: isDark ? "Switch to Light Mode" : "Switch to Dark Mode",
      icon: isDark ? <Sun size={22} /> : <Moon size={22} />,
      action: handleToggleTheme,
    },
  ];

  // Mouse movement proximity calculation
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    setMouseX(e.clientX);
  };

  const handleMouseLeave = () => {
    setMouseX(null);
    setHoveredIndex(null);
  };

  const calculateItemTransform = (index: number) => {
    if (mouseX === null) return { scale: 1.0, translateY: 0 };

    const el = itemRefs.current[index];
    if (!el) return { scale: 1.0, translateY: 0 };

    const rect = el.getBoundingClientRect();
    const itemCenter = rect.left + rect.width / 2;
    const distance = Math.abs(mouseX - itemCenter);
    const proximity = 140; // Proximity detection boundary in px

    if (distance > proximity) {
      return { scale: 1.0, translateY: 0 };
    }

    // Cosine ease curve from 1.38 at distance 0 down to 1.0 at distance 140
    const maxScale = 1.38;
    const scale =
      1.0 + (maxScale - 1.0) * Math.cos((distance / proximity) * (Math.PI / 2));
    const translateY = (1.0 - scale) * 16; // Lift upwards as it magnifies

    return { scale, translateY };
  };

  return (
    <nav
      ref={dockRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="campusconnect-dock-container"
      aria-label="macOS Navigation Dock"
      style={{
        position: "fixed",
        bottom: "20px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 45,
        display: "flex",
        alignItems: "flex-end",
        gap: "10px",
        padding: "10px 16px",
        maxWidth: "calc(100vw - 20px)",
        overflowX: "auto",
        scrollbarWidth: "none",
        borderRadius: "9999px",
        background: isDark
          ? "rgba(255, 255, 255, 0.76)"
          : "rgba(255, 255, 255, 0.72)",
        backdropFilter: "blur(35px) saturate(180%)",
        WebkitBackdropFilter: "blur(35px) saturate(180%)",
        border: isDark
          ? "1px solid rgba(255, 255, 255, 0.55)"
          : "1px solid rgba(255, 255, 255, 0.4)",
        boxShadow: isDark
          ? "0 20px 40px -10px rgba(0, 0, 0, 0.35), 0 8px 16px -4px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.7)"
          : "0 20px 40px -10px rgba(0, 0, 0, 0.2), 0 8px 16px -4px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.6)",
        transition:
          "background-color 300ms ease, border-color 300ms ease, box-shadow 300ms ease",
      }}
    >
      {items.map((item, idx) => {
        const { scale, translateY } = calculateItemTransform(idx);
        const isHovered = hoveredIndex === idx;

        // Active check
        const isPathActive = item.path
          ? location.pathname === item.path ||
            (item.path.includes("?") &&
              location.pathname + location.search === item.path) ||
            (item.path === `/${activeRole}` &&
              location.pathname.startsWith(`/${activeRole}`) &&
              !location.search)
          : false;

        const handleClick = () => {
          if (item.action) {
            item.action();
          } else if (item.path) {
            navigate(item.path);
          }
        };

        return (
          <div
            key={item.id}
            style={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            {/* Tooltip */}
            <div
              className="dock-tooltip"
              style={{
                position: "absolute",
                bottom: "100%",
                marginBottom: "12px",
                pointerEvents: "none",
                opacity: isHovered ? 1 : 0,
                transform: isHovered
                  ? "translateY(0) scale(1)"
                  : "translateY(6px) scale(0.92)",
                transition:
                  "opacity 200ms cubic-bezier(0.32, 0.72, 0, 1), transform 200ms cubic-bezier(0.32, 0.72, 0, 1)",
                padding: "6px 14px",
                borderRadius: "8px",
                background: isDark
                  ? "rgba(255, 255, 255, 0.96)"
                  : "rgba(15, 23, 42, 0.92)",
                color: isDark ? "#000000" : "#ffffff",
                border: isDark
                  ? "1px solid rgba(0, 0, 0, 0.15)"
                  : "1px solid rgba(255, 255, 255, 0.15)",
                fontSize: "0.75rem",
                fontWeight: 700,
                whiteSpace: "nowrap",
                boxShadow: isDark
                  ? "0 8px 24px rgba(0, 0, 0, 0.2)"
                  : "0 8px 20px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.2)",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                zIndex: 50,
                fontFamily:
                  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Inter, sans-serif',
              }}
            >
              {item.label}
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 0,
                  height: 0,
                  borderLeft: "5px solid transparent",
                  borderRight: "5px solid transparent",
                  borderTop: isDark
                    ? "5px solid rgba(255, 255, 255, 0.96)"
                    : "5px solid rgba(15, 23, 42, 0.92)",
                }}
              />
            </div>

            {/* Dock Item Button */}
            <button
              ref={(el) => {
                itemRefs.current[idx] = el;
              }}
              type="button"
              onClick={handleClick}
              onMouseEnter={() => setHoveredIndex(idx)}
              onMouseLeave={() => setHoveredIndex(null)}
              aria-label={item.label}
              className={`campusconnect-dock-btn ${isPathActive ? "active" : ""}`}
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "50%",
                aspectRatio: "1 / 1",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: isDark
                  ? isPathActive
                    ? "rgba(255, 255, 255, 0.95)"
                    : "rgba(255, 255, 255, 0.65)"
                  : isPathActive
                    ? "linear-gradient(135deg, var(--accent, #3b82f6), #1d4ed8)"
                    : "rgba(255, 255, 255, 0.65)",
                color: "#000000",
                border: "1.5px solid #000000",
                outline: "1px solid #000000",
                boxShadow: isPathActive
                  ? "0 4px 14px rgba(0, 0, 0, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.9)"
                  : "0 2px 8px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.5)",
                cursor: "pointer",
                transformOrigin: "bottom center",
                transform: `scale(${scale}) translateY(${translateY}px)`,
                transition:
                  "transform 160ms cubic-bezier(0.32, 0.72, 0, 1), background-color 200ms ease, box-shadow 200ms ease, border-color 200ms ease",
              }}
            >
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#000000",
                  stroke: "#000000",
                }}
              >
                {item.icon}
              </span>
            </button>

            {/* Active Running Indicator Dot */}
            <div
              style={{
                width: "4px",
                height: "4px",
                borderRadius: "50%",
                marginTop: "4px",
                backgroundColor: isPathActive ? "#000000" : "transparent",
                boxShadow: isPathActive ? "0 0 6px rgba(0, 0, 0, 0.7)" : "none",
                transition:
                  "background-color 200ms ease, box-shadow 200ms ease",
              }}
            />
          </div>
        );
      })}
    </nav>
  );
}

export default FloatingDock;
