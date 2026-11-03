import { useMemo } from "react";
import { Button } from "@campusconnect/ui";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { useSession, type RouteGroup } from "../auth/session";
import { WelcomePreloader } from "../components/WelcomePreloader";
import { LanguageSelector } from "../i18n/LanguageSelector";
import { InstallPrompt } from "../pwa/InstallPrompt";

interface RoleNav {
  readonly group: RouteGroup;
  readonly label: string;
  readonly path: string;
  readonly icon: string;
}

const ALL_ROLES: readonly RoleNav[] = [
  { group: 'student', label: 'Student', path: '/student', icon: '🎓' },
  { group: 'workbench', label: 'Workbench', path: '/workbench', icon: '🛠️' },
  { group: 'exec', label: 'Executive', path: '/exec/overview', icon: '📊' },
  { group: 'admin', label: 'Admin', path: '/admin/config', icon: '⚙️' },
  { group: 'ops', label: 'Operations', path: '/ops/health', icon: '📡' },
];

export function Layout({ title }: { readonly title: string }) {
  const { session, signOut, switchRole } = useSession();
  const location = useLocation();
  const navigate = useNavigate();

  // Determine which navigation tabs to display:
  // If session has access to a role or if user has multi-role access
  const userGroups = session?.groups ?? [];
  const visibleRoles = ALL_ROLES.filter(
    (r) =>
      userGroups.includes(r.group) ||
      userGroups.length > 1 ||
      userGroups.includes("student"),
  );

  const currentPersona = useMemo(() => {
    if (location.pathname.startsWith("/workbench"))
      return { name: "Rahul Mehta", role: "Exam Staff", initials: "RM" };
    if (location.pathname.startsWith("/exec"))
      return { name: "Prof. Meera Iyer", role: "Pro VC", initials: "MI" };
    if (location.pathname.startsWith("/admin"))
      return { name: "Dr. Suresh Kumar", role: "Registrar", initials: "SK" };
    if (location.pathname.startsWith("/ops"))
      return { name: "DevOps Operator", role: "Platform Ops", initials: "DO" };
    return {
      name: session?.displayName ?? "Ananya Das",
      role: "B.Tech CSE",
      initials: "AD",
    };
  }, [location.pathname, session?.displayName]);

  return (
    <>
      <WelcomePreloader />
      <header className="cc-header-container">
        <div className="cc-header-main">
          {/* Brand Lockup */}
          <NavLink to="/" className="cc-brand-lockup">
            <div className="cc-brand-logo" aria-hidden="true">
              🏛️
            </div>
            <div>
              <span className="cc-brand-title">CampusConnect</span>
              <span className="cc-brand-sub">JIS UNIVERSITY</span>
            </div>
          </NavLink>

          {/* Role Navigation Switcher */}
          {session !== null && (
            <nav className="cc-role-nav" aria-label="CampusConnect Areas">
              {visibleRoles.map((role) => {
                const isActive = location.pathname.startsWith(`/${role.group}`);
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
                <div
                  className="cc-user-pill"
                  title={`Active: ${currentPersona.name} (${currentPersona.role})`}
                >
                  <div className="cc-avatar-circle" aria-hidden="true">
                    {currentPersona.initials}
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
                </div>
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
