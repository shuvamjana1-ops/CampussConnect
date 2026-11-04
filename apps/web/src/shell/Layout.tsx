import { useMemo, useState } from "react";
import { Button } from "@campusconnect/ui";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { useSession, type RouteGroup } from "../auth/session";
import { WelcomePreloader } from "../components/WelcomePreloader";
import { LanguageSelector } from "../i18n/LanguageSelector";
import { InstallPrompt } from "../pwa/InstallPrompt";
import { BrandLogo } from "../branding/BrandLogo";
import { LogoCustomizerModal } from "../branding/LogoCustomizerModal";
import { ProfileEditorModal } from "../components/UserProfileSection";

interface RoleNav {
  readonly group: RouteGroup;
  readonly label: string;
  readonly path: string;
  readonly icon: string;
}

const ALL_ROLES: readonly RoleNav[] = [
  {
    group: "student",
    label: "Student Portal",
    path: "/portal/student",
    icon: "🎓",
  },
  { group: "staff", label: "Staff Portal", path: "/portal/staff", icon: "👨‍🏫" },
  { group: "admin", label: "Admin Command", path: "/portal/admin", icon: "⚙️" },
];

export function Layout({ title }: { readonly title: string }) {
  const { session, profile, signOut, switchRole } = useSession();
  const location = useLocation();
  const navigate = useNavigate();

  // Determine which navigation tabs to display:
  const userGroups = session?.groups ?? [];
  const visibleRoles = ALL_ROLES.filter(
    (r) =>
      userGroups.includes(r.group) ||
      userGroups.length > 1 ||
      userGroups.includes("student"),
  );

  const currentPersona = useMemo(() => {
    if (profile) {
      const initials = profile.full_name
        .split(" ")
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();
      const roleLabel =
        profile.role === "admin"
          ? "Registrar & Admin"
          : profile.role === "staff"
            ? "Faculty / Warden"
            : "B.Tech CSE (Student)";
      return {
        name: profile.full_name,
        role: roleLabel,
        initials,
        avatar_url: profile.avatar_url,
      };
    }
    if (location.pathname.includes("/staff"))
      return {
        name: "Prof. Rahul Mehta",
        role: "Faculty / Warden",
        initials: "RM",
        avatar_url: null,
      };
    if (location.pathname.includes("/admin"))
      return {
        name: "Dr. Suresh Kumar",
        role: "Registrar & Admin",
        initials: "SK",
        avatar_url: null,
      };
    return {
      name: session?.displayName ?? "Ananya Das",
      role: "B.Tech CSE (Student)",
      initials: "AD",
      avatar_url: null,
    };
  }, [profile, location.pathname, session?.displayName]);

  const [isLogoModalOpen, setIsLogoModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // Logo design can only be edited by administrators on the admin side
  const isAdmin = location.pathname.includes("/admin");

  return (
    <>
      <WelcomePreloader />
      {isAdmin && (
        <LogoCustomizerModal
          isOpen={isLogoModalOpen}
          onClose={() => setIsLogoModalOpen(false)}
        />
      )}
      <ProfileEditorModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
      />
      <header className="cc-header-container">
        <div className="cc-header-main">
          {/* Brand Lockup & Logo Section */}
          <div className="cc-brand-section">
            <NavLink to="/" className="cc-brand-lockup">
              <div
                className="cc-brand-logo"
                aria-hidden="true"
                title="JIS University"
              >
                <BrandLogo size={28} />
              </div>
              <div>
                <span className="cc-brand-title">CampusConnect</span>
                <span className="cc-brand-sub">JIS UNIVERSITY</span>
              </div>
            </NavLink>
            {isAdmin && (
              <button
                type="button"
                className="cc-logo-customize-trigger"
                onClick={() => setIsLogoModalOpen(true)}
                title="Configure Institution Logo (Admin only)"
                aria-label="Configure Institution Logo"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
              </button>
            )}
          </div>

          {/* Role Navigation Switcher */}
          {session !== null && (
            <nav className="cc-role-nav" aria-label="CampusConnect Areas">
              {visibleRoles.map((role) => {
                const isActive =
                  location.pathname.startsWith(`/${role.group}`) ||
                  location.pathname.startsWith(`/portal/${role.group}`);
                return (
                  <NavLink
                    key={role.group}
                    to={role.path}
                    className={`cc-role-tab ${isActive ? "active" : ""}`}
                    onClick={() => {
                      switchRole(role.group);
                    }}
                  >
                    <span aria-hidden="true">{role.icon}</span>
                    <span>{role.label}</span>
                  </NavLink>
                );
              })}
            </nav>
          )}

          {/* User Profile & Actions */}
          <div className="cc-header-actions">
            <LanguageSelector />

            {session !== null ? (
              <>
                <button
                  type="button"
                  className="cc-user-pill"
                  onClick={() => setIsProfileModalOpen(true)}
                  title={`Edit Profile: ${currentPersona.name} (${currentPersona.role})`}
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div
                    className="cc-avatar-circle"
                    aria-hidden="true"
                    style={{ overflow: "hidden" }}
                  >
                    {currentPersona.avatar_url ? (
                      <img
                        src={currentPersona.avatar_url}
                        alt={currentPersona.name}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          borderRadius: "50%",
                        }}
                      />
                    ) : (
                      currentPersona.initials
                    )}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      lineHeight: 1.1,
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 600,
                        color: "#f8fafc",
                        fontSize: "0.8rem",
                      }}
                    >
                      {currentPersona.name}
                    </span>
                    <span style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
                      {currentPersona.role}
                    </span>
                  </div>
                </button>
                <Button
                  variant="secondary"
                  onPress={() => setIsProfileModalOpen(true)}
                >
                  👤 Profile
                </Button>
                <Button
                  variant="secondary"
                  onPress={() => {
                    void signOut();
                    void navigate("/sign-in");
                  }}
                >
                  Switch / Exit
                </Button>
              </>
            ) : (
              <Button
                variant="secondary"
                onPress={() => {
                  void navigate("/sign-in");
                }}
              >
                Sign in
              </Button>
            )}
          </div>
        </div>
      </header>

      <InstallPrompt />

      <main id="main">
        <h1 className="cc-visually-hidden">{title}</h1>
        {/* All server-provided text is rendered as text nodes only, never as HTML. */}
        <Outlet />
      </main>
    </>
  );
}
