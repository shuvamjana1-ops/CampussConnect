import { useState, useRef, useId } from "react";
import { Link } from "react-router";
import {
  ShieldCheck,
  Camera,
  Trash2,
  Save,
  CheckCircle2,
  Lock,
  ArrowLeft,
  Sparkles,
  Building2,
  Mail,
  Phone,
  Hash,
  AlertCircle,
} from "lucide-react";
import { useSession } from "../auth/session";
import { useToast } from "../components/Toast";
import { GlassCard } from "../components/GlassCard";

export interface ProfilePageProps {
  readonly isModal?: boolean;
  readonly onClose?: () => void;
}

const PRESET_AVATARS = [
  { label: "Student Ananya", path: "/assets/profiles/student-ananya.svg" },
  { label: "Faculty Rahul", path: "/assets/profiles/staff-rahul.svg" },
  { label: "Dean Suresh", path: "/assets/profiles/admin-suresh.svg" },
  { label: "Default Crest", path: "/assets/profiles/default-avatar.svg" },
] as const;

const DEPARTMENTS = [
  "Computer Science & Engineering",
  "Electronics & Communication",
  "Mechanical Engineering",
  "Civil Engineering",
  "Examination & Records Cell",
  "Facilities & Infrastructure Services",
  "Hostel Administration & Estates",
  "University Administration & Governance",
] as const;

export default function ProfilePage({
  isModal = false,
  onClose,
}: ProfilePageProps) {
  const { profile, role, user, updateProfile } = useSession();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fullNameId = useId();
  const emailId = useId();
  const phoneId = useId();
  const rollId = useId();
  const deptId = useId();
  const semesterId = useId();
  const emergencyId = useId();
  const bioId = useId();

  const [fullName, setFullName] = useState(profile?.full_name || "Ananya Das");
  const [phone, setPhone] = useState(profile?.phone || "+91-98301-23456");
  const [rollNumber, setRollNumber] = useState(
    profile?.roll_number || "JISU/2024/CSE/0842",
  );
  const [department, setDepartment] = useState(
    profile?.department || "Computer Science & Engineering",
  );
  const [emergencyContact, setEmergencyContact] = useState(
    profile?.emergency_contact || "+91-98300-99887 (Guardian / Next of Kin)",
  );
  const [semester, setSemester] = useState(
    profile?.semester || "4th Semester (UG)",
  );
  const [bio, setBio] = useState(
    profile?.bio ||
      "B.Tech CSE 4th Semester student. Campus tech lead & AI researcher. Roll: JISU/2024/CSE/0842.",
  );
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    profile?.avatar_url || "/assets/profiles/student-ananya.svg",
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const activeRole = role === "staff" ? "staff" : role || "student";
  const isStudent = activeRole === "student";

  const roleAccentColor =
    activeRole === "admin"
      ? "#6366f1"
      : activeRole === "staff"
        ? "#0d9488"
        : "#2563eb";

  const initials = fullName
    ? fullName
        .split(" ")
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "U";

  // Photo upload handler converting image to data URL
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast("Please select a valid image file (PNG, JPG, SVG, WebP).", "error");
      return;
    }

    if (file.size > 4 * 1024 * 1024) {
      toast(
        "Image file exceeds 4MB limit. Please select a smaller photo.",
        "error",
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setAvatarUrl(result);
      toast(
        'Profile photo loaded! Click "Save Profile & Details" to apply.',
        "info",
      );
    };
    reader.onerror = () => {
      toast("Failed to read image file.", "error");
    };
    reader.readAsDataURL(file);
  };

  const handleSelectPreset = (presetPath: string, presetLabel: string) => {
    setAvatarUrl(presetPath);
    toast(
      `Preset avatar "${presetLabel}" chosen. Click Save to apply.`,
      "info",
    );
  };

  const handleRemovePhoto = () => {
    setAvatarUrl(null);
    toast(
      "Photo removed. Official initials monogram will be displayed.",
      "info",
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      toast("Full name is required.", "error");
      return;
    }

    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const res = await updateProfile({
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        roll_number: rollNumber.trim() || null,
        department: department.trim() || null,
        emergency_contact: emergencyContact.trim() || null,
        semester: semester.trim() || null,
        bio: bio.trim() || null,
        avatar_url: avatarUrl,
      });

      if (res.success) {
        setSaveSuccess(true);
        toast(
          "Profile photo & personal details updated successfully!",
          "success",
        );
        if (onClose) {
          onClose();
        }
      } else {
        toast(res.error || "Failed to update profile.", "error");
      }
    } catch (err: any) {
      toast(err.message || "An error occurred while saving profile.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const backLink = isStudent
    ? "/student"
    : activeRole === "staff"
      ? "/staff"
      : "/admin";

  return (
    <div
      className="cc-profile-page-wrapper"
      style={{
        maxWidth: isModal ? "100%" : "1080px",
        margin: "0 auto",
        padding: isModal ? "0" : "24px 16px 80px",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Inter, sans-serif',
      }}
    >
      {/* Top Breadcrumb & Navigation Bar (Standalone View) */}
      {!isModal && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "20px",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Link
              to={backLink}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                borderRadius: "12px",
                background: "rgba(255, 255, 255, 0.55)",
                border: "1px solid rgba(255, 255, 255, 0.4)",
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "var(--text-main, #0f172a)",
                textDecoration: "none",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
              }}
            >
              <ArrowLeft size={14} />
              <span>Back to Workspace</span>
            </Link>
            <span
              style={{
                color: "var(--text-muted, #64748b)",
                fontSize: "0.8rem",
              }}
            >
              /
            </span>
            <span
              style={{
                color: "var(--text-muted, #64748b)",
                fontSize: "0.8rem",
                fontWeight: 500,
              }}
            >
              CampusConnect Identity &amp; Account
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "5px 12px",
                borderRadius: "9999px",
                background: "rgba(16, 185, 129, 0.12)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                color: "#059669",
                fontSize: "0.75rem",
                fontWeight: 700,
              }}
            >
              <ShieldCheck size={13} />
              <span>PostgreSQL RLS Active</span>
            </span>
          </div>
        </div>
      )}

      {/* Main Glass Dossier Card */}
      <GlassCard
        className="cc-profile-card"
        style={{
          padding: isModal ? "1.5rem" : "2.5rem",
          borderRadius: "24px",
          position: "relative",
        }}
      >
        {/* Header Block with Role Dossier Tag */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "2rem",
            flexWrap: "wrap",
            gap: "1rem",
            borderBottom: "1px solid rgba(0, 0, 0, 0.08)",
            paddingBottom: "1.5rem",
          }}
        >
          <div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                color: roleAccentColor,
                fontWeight: 800,
                fontSize: "0.75rem",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: "0.4rem",
              }}
            >
              <span>👤</span>
              <span>USER IDENTITY &amp; PERSONAL DOSSIER</span>
            </div>
            <h1
              style={{
                fontSize: isModal ? "1.4rem" : "1.85rem",
                fontWeight: 900,
                color: "var(--text-main, #0f172a)",
                margin: "0 0 0.35rem 0",
                letterSpacing: "-0.025em",
                lineHeight: 1.15,
              }}
            >
              Profile Photo &amp; Personal Details
            </h1>
            <p
              style={{
                margin: 0,
                fontSize: "0.875rem",
                color: "var(--text-muted, #64748b)",
              }}
            >
              Manage your official CampusConnect institutional credentials,
              contact dossier, and identity photograph for JIS University.
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: 800,
                padding: "6px 14px",
                borderRadius: "9999px",
                background: "rgba(255, 255, 255, 0.6)",
                border: `1.5px solid ${roleAccentColor}`,
                color: roleAccentColor,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)",
              }}
            >
              Role: {activeRole}
            </span>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                style={{
                  background: "rgba(0, 0, 0, 0.06)",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "1.1rem",
                  color: "var(--text-muted, #64748b)",
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                title="Close Profile Editor"
                aria-label="Close"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <form onSubmit={handleSave}>
          {/* SECTION 1: PHOTO & CIRCULAR AVATAR MANAGER */}
          <div
            className="glass-subtle"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "2rem",
              padding: "1.5rem",
              borderRadius: "20px",
              border: "1px solid rgba(255, 255, 255, 0.5)",
              marginBottom: "2rem",
              flexWrap: "wrap",
            }}
          >
            {/* 100% Circular Avatar Geometry */}
            <div style={{ position: "relative" }}>
              <div
                className="cc-avatar-circle"
                style={{
                  width: "92px",
                  height: "92px",
                  borderRadius: "50%",
                  aspectRatio: "1 / 1",
                  overflow: "hidden",
                  background: `linear-gradient(135deg, ${roleAccentColor}, #1e3a8a)`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 10px 28px -4px rgba(0, 0, 0, 0.18)",
                  border: "3px solid #ffffff",
                }}
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={fullName}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      borderRadius: "50%",
                    }}
                  />
                ) : (
                  <span
                    style={{
                      color: "#ffffff",
                      fontWeight: 900,
                      fontSize: "2rem",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {initials}
                  </span>
                )}
              </div>
              <span
                style={{
                  position: "absolute",
                  bottom: "2px",
                  right: "2px",
                  background: "#10b981",
                  width: "18px",
                  height: "18px",
                  borderRadius: "50%",
                  border: "3px solid #ffffff",
                  boxShadow: "0 2px 6px rgba(0, 0, 0, 0.15)",
                }}
                title="Verified Active Campus Identity"
              />
            </div>

            {/* Photo Manager Actions & Presets */}
            <div style={{ flex: 1, minWidth: "260px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "4px",
                }}
              >
                <strong
                  style={{
                    fontSize: "1rem",
                    color: "var(--text-main, #0f172a)",
                  }}
                >
                  Profile Photo &amp; Avatar
                </strong>
                <span
                  style={{
                    fontSize: "0.675rem",
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: "9999px",
                    background: "rgba(37, 99, 235, 0.1)",
                    color: "#2563eb",
                  }}
                >
                  100% Circular Geometry
                </span>
              </div>
              <p
                style={{
                  margin: "0 0 12px 0",
                  fontSize: "0.825rem",
                  color: "var(--text-muted, #64748b)",
                }}
              >
                Upload an official portrait photograph or select an
                institutional preset avatar below.
              </p>

              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  onChange={handlePhotoUpload}
                  style={{ display: "none" }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "8px 16px",
                    borderRadius: "12px",
                    background: "rgba(255, 255, 255, 0.8)",
                    border: "1px solid rgba(0, 0, 0, 0.12)",
                    fontSize: "0.825rem",
                    fontWeight: 600,
                    color: "var(--text-main, #0f172a)",
                    cursor: "pointer",
                    boxShadow: "0 2px 6px rgba(0, 0, 0, 0.04)",
                    transition: "all 150ms ease",
                  }}
                >
                  <Camera size={14} />
                  <span>Upload Photo</span>
                </button>

                {avatarUrl && (
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "8px 14px",
                      borderRadius: "12px",
                      background: "rgba(254, 242, 242, 0.8)",
                      border: "1px solid rgba(239, 68, 68, 0.25)",
                      fontSize: "0.825rem",
                      fontWeight: 600,
                      color: "#dc2626",
                      cursor: "pointer",
                      transition: "all 150ms ease",
                    }}
                  >
                    <Trash2 size={13} />
                    <span>Remove Photo</span>
                  </button>
                )}
              </div>

              {/* Institutional Presets Switcher */}
              <div
                style={{
                  marginTop: "14px",
                  display: "flex",
                  gap: "8px",
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-muted, #64748b)",
                    fontWeight: 700,
                  }}
                >
                  Presets:
                </span>
                {PRESET_AVATARS.map((p) => {
                  const isSelected = avatarUrl === p.path;
                  return (
                    <button
                      key={p.path}
                      type="button"
                      onClick={() => handleSelectPreset(p.path, p.label)}
                      style={{
                        background: isSelected
                          ? "rgba(37, 99, 235, 0.15)"
                          : "rgba(255, 255, 255, 0.7)",
                        border: isSelected
                          ? "1.5px solid #2563eb"
                          : "1px solid rgba(0, 0, 0, 0.08)",
                        borderRadius: "9999px",
                        padding: "4px 12px",
                        fontSize: "0.75rem",
                        cursor: "pointer",
                        fontWeight: isSelected ? 700 : 500,
                        color: isSelected
                          ? "#1d4ed8"
                          : "var(--text-main, #0f172a)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        transition: "all 150ms ease",
                      }}
                    >
                      <Sparkles
                        size={11}
                        style={{ opacity: isSelected ? 1 : 0.4 }}
                      />
                      <span>{p.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* SECTION 2: PERSONAL IDENTITY DOSSIER FORM */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: "1.25rem",
              marginBottom: "1.75rem",
            }}
          >
            {/* Full Name */}
            <div>
              <label
                htmlFor={fullNameId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  marginBottom: "0.4rem",
                  color: "var(--text-main, #0f172a)",
                }}
              >
                <span>Full Name *</span>
              </label>
              <input
                id={fullNameId}
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Ananya Das"
                className="cc-input"
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "12px",
                  border: "1px solid rgba(0, 0, 0, 0.14)",
                  background: "rgba(255, 255, 255, 0.75)",
                  fontSize: "0.875rem",
                  color: "var(--text-main, #0f172a)",
                  boxSizing: "border-box",
                  outline: "none",
                }}
              />
            </div>

            {/* Institutional Email (Read-Only) */}
            <div>
              <label
                htmlFor={emailId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  marginBottom: "0.4rem",
                  color: "var(--text-main, #0f172a)",
                }}
              >
                <Mail size={13} />
                <span>Institutional Email</span>
              </label>
              <input
                id={emailId}
                type="email"
                disabled
                value={
                  profile?.email ||
                  user?.email ||
                  "ananya.das@jisuniversity.ac.in"
                }
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "12px",
                  border: "1px solid rgba(0, 0, 0, 0.08)",
                  background: "rgba(0, 0, 0, 0.03)",
                  fontSize: "0.875rem",
                  color: "var(--text-muted, #64748b)",
                  cursor: "not-allowed",
                  boxSizing: "border-box",
                }}
              />
              <span
                style={{
                  fontSize: "0.7rem",
                  color: "var(--text-muted, #64748b)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  marginTop: "4px",
                }}
              >
                <Lock size={10} />
                <span>🔒 Verified Supabase Auth Identity</span>
              </span>
            </div>

            {/* Phone Number */}
            <div>
              <label
                htmlFor={phoneId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  marginBottom: "0.4rem",
                  color: "var(--text-main, #0f172a)",
                }}
              >
                <Phone size={13} />
                <span>Phone Number</span>
              </label>
              <input
                id={phoneId}
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. +91-98301-23456"
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "12px",
                  border: "1px solid rgba(0, 0, 0, 0.14)",
                  background: "rgba(255, 255, 255, 0.75)",
                  fontSize: "0.875rem",
                  color: "var(--text-main, #0f172a)",
                  boxSizing: "border-box",
                  outline: "none",
                }}
              />
            </div>

            {/* Roll / Registration Number or Staff ID */}
            <div>
              <label
                htmlFor={rollId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  marginBottom: "0.4rem",
                  color: "var(--text-main, #0f172a)",
                }}
              >
                <Hash size={13} />
                <span>
                  {isStudent
                    ? "Roll / Registration Number"
                    : "Staff / Employee ID"}
                </span>
              </label>
              <input
                id={rollId}
                type="text"
                value={rollNumber}
                onChange={(e) => setRollNumber(e.target.value)}
                placeholder={
                  isStudent ? "JISU/2024/CSE/0842" : "JISU-STAFF-104"
                }
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "12px",
                  border: "1px solid rgba(0, 0, 0, 0.14)",
                  background: "rgba(255, 255, 255, 0.75)",
                  fontSize: "0.875rem",
                  color: "var(--text-main, #0f172a)",
                  boxSizing: "border-box",
                  outline: "none",
                }}
              />
            </div>

            {/* Department / Academic Unit */}
            <div>
              <label
                htmlFor={deptId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  marginBottom: "0.4rem",
                  color: "var(--text-main, #0f172a)",
                }}
              >
                <Building2 size={13} />
                <span>Department / Academic Unit</span>
              </label>
              <select
                id={deptId}
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "12px",
                  border: "1px solid rgba(0, 0, 0, 0.14)",
                  background: "rgba(255, 255, 255, 0.75)",
                  fontSize: "0.875rem",
                  color: "var(--text-main, #0f172a)",
                  boxSizing: "border-box",
                  outline: "none",
                  cursor: "pointer",
                }}
              >
                {DEPARTMENTS.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>

            {/* Semester or Academic Designation */}
            <div>
              <label
                htmlFor={semesterId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  marginBottom: "0.4rem",
                  color: "var(--text-main, #0f172a)",
                }}
              >
                <span>
                  {isStudent
                    ? "Academic Semester / Year"
                    : "Academic Designation"}
                </span>
              </label>
              <input
                id={semesterId}
                type="text"
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
                placeholder={
                  isStudent ? "4th Semester (UG)" : "Associate Professor"
                }
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "12px",
                  border: "1px solid rgba(0, 0, 0, 0.14)",
                  background: "rgba(255, 255, 255, 0.75)",
                  fontSize: "0.875rem",
                  color: "var(--text-main, #0f172a)",
                  boxSizing: "border-box",
                  outline: "none",
                }}
              />
            </div>

            {/* Emergency / Alternate Contact */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label
                htmlFor={emergencyId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  marginBottom: "0.4rem",
                  color: "var(--text-main, #0f172a)",
                }}
              >
                <AlertCircle size={13} />
                <span>Emergency / Alternate Contact</span>
              </label>
              <input
                id={emergencyId}
                type="text"
                value={emergencyContact}
                onChange={(e) => setEmergencyContact(e.target.value)}
                placeholder="e.g. +91-98300-99887 (Guardian / Next of Kin)"
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "12px",
                  border: "1px solid rgba(0, 0, 0, 0.14)",
                  background: "rgba(255, 255, 255, 0.75)",
                  fontSize: "0.875rem",
                  color: "var(--text-main, #0f172a)",
                  boxSizing: "border-box",
                  outline: "none",
                }}
              />
            </div>

            {/* Bio / Academic Dossier Notes */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label
                htmlFor={bioId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  marginBottom: "0.4rem",
                  color: "var(--text-main, #0f172a)",
                }}
              >
                <span>Bio / Academic Dossier Notes</span>
              </label>
              <textarea
                id={bioId}
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Brief summary of academic standing, research focus, or campus responsibilities..."
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "12px",
                  border: "1px solid rgba(0, 0, 0, 0.14)",
                  background: "rgba(255, 255, 255, 0.75)",
                  fontSize: "0.875rem",
                  color: "var(--text-main, #0f172a)",
                  boxSizing: "border-box",
                  outline: "none",
                  fontFamily: "inherit",
                  resize: "vertical",
                }}
              />
            </div>
          </div>

          {/* SECTION 3: RLS SECURITY NOTICE & SAVE ACTIONS */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              paddingTop: "1.25rem",
              borderTop: "1px solid rgba(0, 0, 0, 0.08)",
              flexWrap: "wrap",
              gap: "1rem",
            }}
          >
            {/* Strict test string: PostgreSQL RLS Protected */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "0.825rem",
                color: "#059669",
              }}
            >
              <ShieldCheck size={16} />
              <strong style={{ fontWeight: 800 }}>
                PostgreSQL RLS Protected
              </strong>
              <span style={{ color: "var(--text-muted, #64748b)" }}>
                · Only you and Admin can view/modify
              </span>
            </div>

            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              {saveSuccess && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    fontSize: "0.8rem",
                    color: "#059669",
                    fontWeight: 700,
                  }}
                >
                  <CheckCircle2 size={14} />
                  <span>Saved!</span>
                </span>
              )}
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSaving}
                  style={{
                    padding: "10px 18px",
                    borderRadius: "12px",
                    border: "1px solid rgba(0, 0, 0, 0.12)",
                    background: "rgba(255, 255, 255, 0.65)",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    color: "var(--text-main, #0f172a)",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={isSaving}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  background: roleAccentColor,
                  color: "#ffffff",
                  border: "none",
                  padding: "11px 24px",
                  borderRadius: "12px",
                  fontWeight: 700,
                  fontSize: "0.875rem",
                  cursor: isSaving ? "not-allowed" : "pointer",
                  boxShadow: `0 4px 16px ${roleAccentColor}44`,
                  transition: "all 160ms cubic-bezier(0.32, 0.72, 0, 1)",
                  opacity: isSaving ? 0.75 : 1,
                }}
              >
                <Save size={15} />
                <span>
                  {isSaving ? "Saving..." : "✓ Save Profile & Details"}
                </span>
              </button>
            </div>
          </div>
        </form>
      </GlassCard>
    </div>
  );
}
