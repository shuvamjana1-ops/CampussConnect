import { useState, useRef } from "react";
import { useSession } from "../auth/session";
import { useToast } from "./Toast";

export interface UserProfileSectionProps {
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

export function UserProfileSection({
  isModal = false,
  onClose,
}: UserProfileSectionProps) {
  const { profile, updateProfile } = useSession();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [rollNumber, setRollNumber] = useState(profile?.roll_number || "");
  const [department, setDepartment] = useState(
    profile?.department || "Computer Science & Engineering",
  );
  const [emergencyContact, setEmergencyContact] = useState(
    profile?.emergency_contact || "",
  );
  const [semester, setSemester] = useState(
    profile?.semester || "4th Semester (UG)",
  );
  const [bio, setBio] = useState(profile?.bio || "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    profile?.avatar_url || null,
  );
  const [isSaving, setIsSaving] = useState(false);

  // File upload handler converting image to data URL
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast("Please select an image file (PNG, JPG, SVG, WebP).", "error");
      return;
    }

    // Limit client-side preview to 4MB
    if (file.size > 4 * 1024 * 1024) {
      toast("Image file too large. Please select an image under 4MB.", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setAvatarUrl(result);
      toast("Profile photo loaded! Click Save to apply.", "info");
    };
    reader.onerror = () => {
      toast("Failed to read image file.", "error");
    };
    reader.readAsDataURL(file);
  };

  const handleSelectPreset = (presetPath: string) => {
    setAvatarUrl(presetPath);
    toast("Preset avatar chosen! Click Save to apply.", "info");
  };

  const handleRemovePhoto = () => {
    setAvatarUrl(null);
    toast("Photo removed. Initial monogram will be displayed.", "info");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      toast("Full name is required.", "error");
      return;
    }

    setIsSaving(true);
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
      toast(err.message || "An error occurred while saving.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const roleBadgeColor =
    profile?.role === "admin"
      ? "var(--admin-accent, #6d28d9)"
      : profile?.role === "staff"
        ? "var(--staff-primary, #059669)"
        : "var(--student-primary, #1d4ed8)";

  const initials = fullName
    ? fullName
        .split(" ")
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "U";

  return (
    <div className={isModal ? "" : "cf-card"} style={{ position: "relative" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              color: roleBadgeColor,
              fontWeight: 800,
              fontSize: "0.75rem",
              textTransform: "uppercase",
              marginBottom: "0.25rem",
              letterSpacing: "0.05em",
            }}
          >
            <span>👤</span> USER IDENTITY &amp; PERSONAL DOSSIER
          </div>
          <h2
            style={{
              fontSize: isModal ? "1.35rem" : "1.5rem",
              fontWeight: 900,
              color: "var(--text-main)",
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            Profile Photo &amp; Personal Details
          </h2>
          <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Manage your official CampusConnect identity, avatar photograph, and
            contact information.
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              fontSize: "0.75rem",
              fontWeight: 800,
              padding: "4px 10px",
              borderRadius: "9999px",
              background: "var(--bg-surface-subtle)",
              border: `1px solid ${roleBadgeColor}`,
              color: roleBadgeColor,
              textTransform: "uppercase",
            }}
          >
            Role: {profile?.role || "student"}
          </span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                fontSize: "1.25rem",
                color: "var(--text-muted)",
                padding: "4px 8px",
                borderRadius: "6px",
              }}
              title="Close Profile Editor"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <form onSubmit={handleSave}>
        {/* SECTION 1: PHOTO & AVATAR MANAGER */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "1.5rem",
            padding: "1.25rem",
            background: "var(--bg-surface-subtle)",
            borderRadius: "16px",
            border: "1px solid var(--border-subtle)",
            marginBottom: "1.75rem",
            flexWrap: "wrap",
          }}
        >
          {/* Circular Avatar Preview */}
          <div style={{ position: "relative" }}>
            <div
              style={{
                width: "84px",
                height: "84px",
                borderRadius: "50%",
                aspectRatio: "1 / 1",
                overflow: "hidden",
                background: roleBadgeColor,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 8px 24px rgba(15, 40, 80, 0.15)",
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
                    fontSize: "1.8rem",
                  }}
                >
                  {initials}
                </span>
              )}
            </div>
            <span
              style={{
                position: "absolute",
                bottom: "0",
                right: "0",
                background: "#10b981",
                width: "14px",
                height: "14px",
                borderRadius: "50%",
                border: "2px solid #ffffff",
              }}
              title="Active Profile"
            />
          </div>

          {/* Photo Actions */}
          <div style={{ flex: 1, minWidth: "240px" }}>
            <strong
              style={{
                display: "block",
                fontSize: "0.95rem",
                color: "var(--text-main)",
                marginBottom: "4px",
              }}
            >
              Profile Photo &amp; Avatar
            </strong>
            <p
              style={{
                margin: "0 0 10px",
                fontSize: "0.8rem",
                color: "var(--text-muted)",
              }}
            >
              100% circular aspect ratio. Upload your photo or choose an
              institutional preset.
            </p>

            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                style={{ display: "none" }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="cf-btn cf-btn-secondary"
                style={{ padding: "6px 12px", fontSize: "0.8rem" }}
              >
                📷 Upload Photo
              </button>

              {avatarUrl && (
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  className="cf-btn cf-btn-secondary"
                  style={{
                    padding: "6px 12px",
                    fontSize: "0.8rem",
                    color: "#dc2626",
                  }}
                >
                  ✕ Remove
                </button>
              )}
            </div>

            {/* Presets Gallery */}
            <div
              style={{
                marginTop: "0.75rem",
                display: "flex",
                gap: "6px",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontSize: "0.725rem",
                  color: "var(--text-muted)",
                  fontWeight: 600,
                }}
              >
                Presets:
              </span>
              {PRESET_AVATARS.map((p) => (
                <button
                  key={p.path}
                  type="button"
                  onClick={() => handleSelectPreset(p.path)}
                  style={{
                    background:
                      avatarUrl === p.path
                        ? "rgba(29, 78, 216, 0.15)"
                        : "var(--bg-surface)",
                    border: `1px solid ${avatarUrl === p.path ? "var(--student-primary)" : "var(--border-subtle)"}`,
                    borderRadius: "9999px",
                    padding: "2px 8px",
                    fontSize: "0.725rem",
                    cursor: "pointer",
                    fontWeight: 600,
                    color:
                      avatarUrl === p.path
                        ? "var(--student-primary)"
                        : "var(--text-main)",
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* SECTION 2: PERSONAL DETAILS FORM */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "1.25rem",
            marginBottom: "1.25rem",
          }}
        >
          <div>
            <label
              style={{
                display: "block",
                fontSize: "0.85rem",
                fontWeight: 700,
                marginBottom: "0.35rem",
                color: "var(--text-main)",
              }}
            >
              Full Name *
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Ananya Das"
              className="cf-input"
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: "0.85rem",
                fontWeight: 700,
                marginBottom: "0.35rem",
                color: "var(--text-main)",
              }}
            >
              Institutional Email
            </label>
            <input
              type="email"
              disabled
              value={profile?.email || "user@jisuniversity.ac.in"}
              className="cf-input"
              style={{
                background: "var(--bg-surface-subtle)",
                cursor: "not-allowed",
                color: "var(--text-muted)",
              }}
            />
            <span
              style={{
                fontSize: "0.7rem",
                color: "var(--text-muted)",
                display: "block",
                marginTop: "2px",
              }}
            >
              🔒 Verified Supabase Auth Identity
            </span>
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: "0.85rem",
                fontWeight: 700,
                marginBottom: "0.35rem",
                color: "var(--text-main)",
              }}
            >
              Phone Number
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. +91-98301-23456"
              className="cf-input"
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: "0.85rem",
                fontWeight: 700,
                marginBottom: "0.35rem",
                color: "var(--text-main)",
              }}
            >
              {profile?.role === "student"
                ? "Roll / Registration Number"
                : "Staff / Employee ID"}
            </label>
            <input
              type="text"
              value={rollNumber}
              onChange={(e) => setRollNumber(e.target.value)}
              placeholder={
                profile?.role === "student"
                  ? "JISU/2024/CSE/0842"
                  : "JISU-STAFF-104"
              }
              className="cf-input"
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: "0.85rem",
                fontWeight: 700,
                marginBottom: "0.35rem",
                color: "var(--text-main)",
              }}
            >
              Department / Academic Unit
            </label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="cf-select"
            >
              {DEPARTMENTS.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: "0.85rem",
                fontWeight: 700,
                marginBottom: "0.35rem",
                color: "var(--text-main)",
              }}
            >
              {profile?.role === "student"
                ? "Academic Semester / Year"
                : "Academic Designation"}
            </label>
            <input
              type="text"
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
              placeholder="e.g. 4th Semester (UG) / Associate Professor"
              className="cf-input"
            />
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <label
              style={{
                display: "block",
                fontSize: "0.85rem",
                fontWeight: 700,
                marginBottom: "0.35rem",
                color: "var(--text-main)",
              }}
            >
              Emergency / Alternate Contact
            </label>
            <input
              type="text"
              value={emergencyContact}
              onChange={(e) => setEmergencyContact(e.target.value)}
              placeholder="e.g. +91-98300-99887 (Guardian / Next of Kin)"
              className="cf-input"
            />
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <label
              style={{
                display: "block",
                fontSize: "0.85rem",
                fontWeight: 700,
                marginBottom: "0.35rem",
                color: "var(--text-main)",
              }}
            >
              Bio / Academic Dossier Notes
            </label>
            <textarea
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Brief summary of academic standing, research focus, or campus responsibilities..."
              className="cf-textarea"
            />
          </div>
        </div>

        {/* SECTION 3: RLS STATUS & SUBMIT */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: "1rem",
            borderTop: "1px solid var(--border-subtle)",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "0.8rem",
              color: "#059669",
            }}
          >
            <span>🛡️</span>
            <strong>PostgreSQL RLS Protected</strong>
            <span style={{ color: "var(--text-muted)" }}>
              · Only you and Admin can view/modify
            </span>
          </div>

          <div style={{ display: "flex", gap: "0.75rem" }}>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="cf-btn cf-btn-secondary"
                disabled={isSaving}
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={isSaving}
              className="cf-btn"
              style={{
                background: roleBadgeColor,
                color: "#ffffff",
                border: "none",
                padding: "10px 20px",
                fontWeight: 700,
              }}
            >
              {isSaving ? "Saving..." : "✓ Save Profile & Details"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export function ProfileEditorModal({
  isOpen,
  onClose,
}: {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.55)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100,
        padding: "1rem",
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="cf-card"
        style={{
          maxWidth: "680px",
          width: "100%",
          maxHeight: "92vh",
          overflowY: "auto",
          boxShadow: "var(--shadow-xl)",
          padding: "1.75rem",
        }}
      >
        <UserProfileSection isModal={true} onClose={onClose} />
      </div>
    </div>
  );
}
