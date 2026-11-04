import React, { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useSession } from "../auth/session";
import { useToast } from "../components/Toast";
import { GlassCard } from "../components/GlassCard";
import { LiquidGlassWallpaper } from "../components/LiquidGlassWallpaper";
import { PillButton } from "../components/PillButton";
import { BrandLogo } from "../branding/BrandLogo";

export default function SignIn() {
  const { signIn, isConfigured } = useSession();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [email, setEmail] = useState("student1@demo.com");
  const [password, setPassword] = useState("Student@123");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fillCredentials = (
    demoEmail: string,
    demoPass: string,
    label: string,
  ) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setErrorMessage(null);
    toast(`Populated credentials for ${label}`, "info");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSubmitting(true);

    const result = await signIn(email, password);
    setSubmitting(false);

    if (!result.success) {
      setErrorMessage(
        result.error || "Authentication failed. Please verify credentials.",
      );
      toast("Login failed", "error");
      return;
    }

    toast(
      `Authenticated as ${result.role?.toUpperCase() || "USER"}!`,
      "success",
    );

    // Route to appropriate dashboard based on verified profile role
    if (result.role === "admin") {
      navigate("/admin");
    } else if (result.role === "staff") {
      navigate("/staff");
    } else {
      navigate("/student");
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1.25rem",
        boxSizing: "border-box",
        fontFamily:
          'var(--font-system, -apple-system, "SF Pro Display", Inter, system-ui, sans-serif)',
        color: "var(--text-main, #0f172a)",
      }}
    >
      {/* Background Animated Wallpaper */}
      <LiquidGlassWallpaper role="default" />

      {/* Main Centered macOS Frosted Window Card */}
      <GlassCard
        material="glass-strong"
        spotlight
        style={{
          width: "100%",
          maxWidth: "1020px",
          padding: 0,
          borderRadius: "28px",
          boxShadow: "var(--glass-strong-shadow)",
          overflow: "hidden",
          display: "flex",
          flexWrap: "wrap",
        }}
      >
        {/* Left Visual & Architecture Panel */}
        <div
          style={{
            flex: "1 1 440px",
            background:
              "linear-gradient(135deg, rgba(15, 40, 80, 0.95) 0%, rgba(30, 58, 138, 0.90) 50%, rgba(67, 56, 202, 0.92) 100%)",
            color: "#ffffff",
            padding: "3rem 2.5rem",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            position: "relative",
          }}
        >
          <div>
            {/* macOS Window Controls Mock */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "2.5rem",
              }}
            >
              <div
                style={{
                  width: "12px",
                  height: "12px",
                  borderRadius: "50%",
                  background: "#ff5f56",
                  boxShadow: "0 0 4px rgba(255, 95, 86, 0.5)",
                }}
              />
              <div
                style={{
                  width: "12px",
                  height: "12px",
                  borderRadius: "50%",
                  background: "#ffbd2e",
                  boxShadow: "0 0 4px rgba(255, 189, 46, 0.5)",
                }}
              />
              <div
                style={{
                  width: "12px",
                  height: "12px",
                  borderRadius: "50%",
                  background: "#27c93f",
                  boxShadow: "0 0 4px rgba(39, 201, 63, 0.5)",
                }}
              />
            </div>

            {/* Institution Header Lockup */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "14px",
                marginBottom: "2rem",
              }}
            >
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  background: "#f59e0b",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 8px 20px rgba(245, 158, 11, 0.4)",
                  overflow: "hidden",
                }}
              >
                <BrandLogo size={32} />
              </div>
              <div>
                <div
                  style={{
                    fontSize: "1.35rem",
                    fontWeight: 900,
                    letterSpacing: "-0.02em",
                    color: "#ffffff",
                  }}
                >
                  JIS UNIVERSITY
                </div>
                <div
                  style={{
                    fontSize: "0.8rem",
                    color: "#93c5fd",
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                  }}
                >
                  CampusConnect Enterprise Portal
                </div>
              </div>
            </div>

            <h1
              style={{
                fontSize: "2.2rem",
                fontWeight: 900,
                lineHeight: 1.15,
                marginBottom: "1rem",
                letterSpacing: "-0.03em",
                color: "#ffffff",
              }}
            >
              Zero-Trust Campus Operations &amp; Grievance Engine.
            </h1>

            <p
              style={{
                fontSize: "0.95rem",
                lineHeight: 1.6,
                color: "#cbd5e1",
                maxWidth: "420px",
                marginBottom: "2rem",
              }}
            >
              Powered by Supabase Auth, PostgreSQL Row-Level Security (RLS), and
              verified role-based access control for students, staff, and
              administrative leadership.
            </p>

            {/* Security Highlights */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.85rem",
                maxWidth: "400px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  background: "rgba(255, 255, 255, 0.08)",
                  backdropFilter: "blur(16px)",
                  padding: "10px 14px",
                  borderRadius: "12px",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                }}
              >
                <span style={{ fontSize: "1.2rem" }}>🛡️</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "0.825rem" }}>
                    RLS Security Enforced
                  </div>
                  <div style={{ fontSize: "0.725rem", color: "#94a3b8" }}>
                    Row-level policies prevent cross-tenant data leaks.
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  background: "rgba(255, 255, 255, 0.08)",
                  backdropFilter: "blur(16px)",
                  padding: "10px 14px",
                  borderRadius: "12px",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                }}
              >
                <span style={{ fontSize: "1.2rem" }}>🔒</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "0.825rem" }}>
                    Anti-Privilege Escalation Trigger
                  </div>
                  <div style={{ fontSize: "0.725rem", color: "#94a3b8" }}>
                    User roles locked in DB; client tampering is rejected.
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  background: "rgba(255, 255, 255, 0.08)",
                  backdropFilter: "blur(16px)",
                  padding: "10px 14px",
                  borderRadius: "12px",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                }}
              >
                <span style={{ fontSize: "1.2rem" }}>⚡</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "0.825rem" }}>
                    Real-Time Status Progression
                  </div>
                  <div style={{ fontSize: "0.725rem", color: "#94a3b8" }}>
                    Submitted → Under Review → Assigned → Resolved.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              paddingTop: "2rem",
              borderTop: "1px solid rgba(255, 255, 255, 0.12)",
              fontSize: "0.785rem",
              color: "#94a3b8",
            }}
          >
            JIS University CampusConnect Portal · Academic Session 2026-27
          </div>
        </div>

        {/* Right Authentication & Quick-Fill Panel */}
        <div
          style={{
            flex: "1 1 480px",
            padding: "3rem 2.5rem",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            boxSizing: "border-box",
          }}
        >
          <div style={{ marginBottom: "1.5rem" }}>
            <h2
              style={{
                fontSize: "1.85rem",
                fontWeight: 900,
                letterSpacing: "-0.02em",
                margin: "0 0 0.5rem",
                color: "var(--text-main, #0f172a)",
              }}
            >
              Sign In to Your Portal
            </h2>
            <p
              style={{
                margin: 0,
                color: "var(--text-muted, #64748b)",
                fontSize: "0.9rem",
              }}
            >
              Select a verified demo profile or enter your institutional
              credentials.
            </p>
          </div>

          {/* Quick-Fill Demo Profiles Panel */}
          <div
            className="glass-subtle"
            style={{
              padding: "1.25rem",
              borderRadius: "18px",
              marginBottom: "1.75rem",
              border: "1px solid var(--glass-border)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "0.85rem",
              }}
            >
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 800,
                  color: "var(--text-muted, #64748b)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                🔑 One-Click Demo Credentials
              </span>
              <span
                style={{
                  fontSize: "0.7rem",
                  padding: "2px 8px",
                  borderRadius: "6px",
                  background: isConfigured ? "#dcfce7" : "#fef3c7",
                  color: isConfigured ? "#15803d" : "#b45309",
                  fontWeight: 700,
                }}
              >
                {isConfigured ? "Supabase Connected" : "Demo Sandbox"}
              </span>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              {/* 1. Admin Quick-Fill Button */}
              <button
                type="button"
                onClick={() =>
                  fillCredentials(
                    "admin@demo.com",
                    "Admin@123",
                    "Administrator",
                  )
                }
                className="glass-subtle"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "9px 12px",
                  borderRadius: "10px",
                  cursor: "pointer",
                  textAlign: "left",
                  border: "1px solid var(--glass-border)",
                }}
              >
                <div>
                  <strong
                    style={{
                      fontSize: "0.825rem",
                      color: "var(--admin-primary, #4338ca)",
                      display: "block",
                    }}
                  >
                    🛡️ Administrative Command
                  </strong>
                  <span
                    style={{
                      fontSize: "0.725rem",
                      color: "var(--text-muted, #64748b)",
                    }}
                  >
                    admin@demo.com · JISU-ADM-001
                  </span>
                </div>
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: "var(--admin-accent, #6366f1)",
                  }}
                >
                  Fill →
                </span>
              </button>

              {/* 2. Staff Quick-Fill Grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "0.5rem",
                }}
              >
                <button
                  type="button"
                  onClick={() =>
                    fillCredentials(
                      "faculty@demo.com",
                      "staff@123",
                      "Staff 1 (Exam Warden)",
                    )
                  }
                  className="glass-subtle"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    padding: "8px 10px",
                    borderRadius: "10px",
                    cursor: "pointer",
                    textAlign: "left",
                    border: "1px solid var(--glass-border)",
                  }}
                >
                  <strong
                    style={{
                      fontSize: "0.785rem",
                      color: "var(--staff-primary, #0f766e)",
                    }}
                  >
                    🔧 Staff &amp; Faculty Portal
                  </strong>
                  <span
                    style={{
                      fontSize: "0.725rem",
                      color: "var(--text-muted, #64748b)",
                    }}
                  >
                    faculty@demo.com · JISU-STAFF-104
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    fillCredentials(
                      "warden@demo.com",
                      "staff@123",
                      "Staff 2 (Estates)",
                    )
                  }
                  className="glass-subtle"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    padding: "8px 10px",
                    borderRadius: "10px",
                    cursor: "pointer",
                    textAlign: "left",
                    border: "1px solid var(--glass-border)",
                  }}
                >
                  <strong
                    style={{
                      fontSize: "0.785rem",
                      color: "var(--staff-primary, #0f766e)",
                    }}
                  >
                    🔧 Staff &amp; Faculty Portal
                  </strong>
                  <span
                    style={{
                      fontSize: "0.725rem",
                      color: "var(--text-muted, #64748b)",
                    }}
                  >
                    warden@demo.com · JISU-EST-202
                  </span>
                </button>
              </div>

              {/* 3. Student Quick-Fill Grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "0.5rem",
                }}
              >
                <button
                  type="button"
                  onClick={() =>
                    fillCredentials(
                      "student1@demo.com",
                      "Student@123",
                      "Student 1 (Ananya Das)",
                    )
                  }
                  className="glass-subtle"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    padding: "8px 10px",
                    borderRadius: "10px",
                    cursor: "pointer",
                    textAlign: "left",
                    border: "1px solid var(--glass-border)",
                  }}
                >
                  <strong
                    style={{
                      fontSize: "0.785rem",
                      color: "var(--student-primary, #1d4ed8)",
                    }}
                  >
                    🎓 Student Portal
                  </strong>
                  <span
                    style={{
                      fontSize: "0.725rem",
                      color: "var(--text-muted, #64748b)",
                    }}
                  >
                    student1@demo.com · JISU/2024/CSE/0842
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    fillCredentials(
                      "student2@demo.com",
                      "Student@123",
                      "Student 2 (Rohan Sharma)",
                    )
                  }
                  className="glass-subtle"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    padding: "8px 10px",
                    borderRadius: "10px",
                    cursor: "pointer",
                    textAlign: "left",
                    border: "1px solid var(--glass-border)",
                  }}
                >
                  <strong
                    style={{
                      fontSize: "0.785rem",
                      color: "var(--student-primary, #1d4ed8)",
                    }}
                  >
                    🎓 Student Portal
                  </strong>
                  <span
                    style={{
                      fontSize: "0.725rem",
                      color: "var(--text-muted, #64748b)",
                    }}
                  >
                    student2@demo.com
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div
              style={{
                padding: "12px 16px",
                background: "rgba(239, 68, 68, 0.12)",
                border: "1px solid rgba(239, 68, 68, 0.35)",
                color: "#dc2626",
                borderRadius: "12px",
                fontSize: "0.85rem",
                fontWeight: 600,
                marginBottom: "1.25rem",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span>⚠️</span>
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Login Form */}
          <form
            onSubmit={handleSubmit}
            style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  color: "var(--text-main, #0f172a)",
                  marginBottom: "0.4rem",
                }}
              >
                Institutional Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@demo.com"
                className="glass-input"
              />
            </div>

            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "0.4rem",
                }}
              >
                <label
                  style={{
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    color: "var(--text-main, #0f172a)",
                  }}
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-muted, #64748b)",
                    fontSize: "0.75rem",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="glass-input"
              />
            </div>

            <PillButton
              type="submit"
              disabled={submitting}
              loading={submitting}
              variant="primary"
              size="lg"
              fullWidth
              glow
              style={{ marginTop: "0.5rem" }}
            >
              {submitting
                ? "Verifying Credentials..."
                : "Authenticate & Enter Portal →"}
            </PillButton>
          </form>

          {/* Links to Signup & Landing */}
          <div
            style={{
              marginTop: "1.75rem",
              paddingTop: "1.25rem",
              borderTop: "1px solid var(--glass-border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "0.85rem",
              color: "var(--text-muted, #64748b)",
            }}
          >
            <span>
              Don't have an account?{" "}
              <Link
                to="/signup"
                style={{
                  color: "var(--accent, #2563eb)",
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                Create Account
              </Link>
            </span>
            <Link
              to="/"
              style={{
                color: "var(--text-muted, #64748b)",
                textDecoration: "none",
              }}
            >
              Return Home
            </Link>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
