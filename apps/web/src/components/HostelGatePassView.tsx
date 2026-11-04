import { useEffect, useState } from "react";
import {
  Building2,
  QrCode,
  CheckCircle2,
  XCircle,
  Send,
  PlusCircle,
  DoorOpen,
  X,
  ShieldAlert,
} from "lucide-react";
import { GlassCard } from "./GlassCard";
import { useToast } from "./Toast";
import { useSession } from "../auth/session";
import {
  complaintStore,
  type HostelGatePass,
} from "../services/complaintStore";

export interface HostelGatePassViewProps {
  readonly initialSubView?: "passes" | "request" | "warden";
  readonly studentRoll?: string;
  readonly canManagePermissions?: boolean;
}

export function HostelGatePassView({
  initialSubView = "passes",
  studentRoll = "JISU/2024/CSE/0842",
  canManagePermissions,
}: HostelGatePassViewProps) {
  const session = useSession();
  const canManage =
    canManagePermissions !== undefined
      ? canManagePermissions
      : Boolean(session?.role === "admin" || session?.role === "staff");

  const [subView, setSubView] = useState<"passes" | "request" | "warden">(
    () => {
      if (initialSubView === "warden" && !canManage) return "passes";
      return initialSubView;
    },
  );

  const [passes, setPasses] = useState<readonly HostelGatePass[]>(() =>
    complaintStore.getHostelPasses(),
  );
  const { toast } = useToast();

  // Keep subView synchronized with permissions
  useEffect(() => {
    if (!canManage && subView === "warden") {
      setSubView("passes");
    }
  }, [canManage, subView]);

  // QR Slip Modal State
  const [activeSlipPass, setActiveSlipPass] = useState<HostelGatePass | null>(
    null,
  );

  // Form State
  const [passType, setPassType] =
    useState<HostelGatePass["passType"]>("Day Outpass");
  const [hostelBlock, setHostelBlock] = useState("Mandakini Girls Residence");
  const [roomNumber, setRoomNumber] = useState("304");
  const [destination, setDestination] = useState("");
  const [departureTime, setDepartureTime] = useState("Today, 04:30 PM");
  const [expectedReturnTime, setExpectedReturnTime] = useState(
    "Today, 08:00 PM (Curfew)",
  );
  const [parentPhone, setParentPhone] = useState("+91-98301-23456");
  const [reason, setReason] = useState("");

  // Warden Desk search / filter
  const [wardenFilter, setWardenFilter] = useState<
    "all" | "pending" | "approved" | "gate_checked_out"
  >("all");

  useEffect(() => {
    const unsub = complaintStore.subscribe(() => {
      setPasses(complaintStore.getHostelPasses());
    });
    return unsub;
  }, []);

  const handleRequestPass = (e: React.FormEvent) => {
    e.preventDefault();
    if (!destination.trim() || !reason.trim()) {
      toast("Please provide destination and purpose of leave.", "error");
      return;
    }

    const newPass = complaintStore.requestHostelPass({
      studentId: session?.profile?.id || "usr_ananya_01",
      studentName: session?.profile?.full_name || "Ananya Das",
      rollNumber: studentRoll,
      hostelBlock,
      roomNumber,
      passType,
      destination: destination.trim(),
      departureTime,
      expectedReturnTime,
      parentPhone,
      reason: reason.trim(),
    });

    toast(
      `Hostel Pass request #${newPass.passNumber} submitted to Admin / Warden Desk!`,
      "success",
    );
    setDestination("");
    setReason("");
    setSubView("passes");
  };

  const handleWardenAction = (
    passId: string,
    status: HostelGatePass["status"],
    notes?: string,
  ) => {
    if (!canManage) {
      toast(
        "Permission Denied: Students are not authorized to grant or update gate pass permissions.",
        "error",
      );
      return;
    }
    const approverName =
      session?.role === "admin"
        ? `${session?.profile?.full_name || "Super Administrator"} (Admin Command Center)`
        : `${session?.profile?.full_name || "Dr. Anita Bannerjee"} (Hostel Warden)`;
    const role = session?.role || "admin";
    const success = complaintStore.updateHostelPassStatus(
      passId,
      status,
      notes,
      approverName,
      role,
    );
    if (success) {
      toast(`Pass status updated to ${status.toUpperCase()}!`, "success");
    } else {
      toast("Operation failed: Unauthorized to grant permissions.", "error");
    }
  };

  const getStatusBadge = (status: HostelGatePass["status"]) => {
    switch (status) {
      case "pending":
        return {
          label: "Pending Warden Approval",
          bg: "rgba(245, 158, 11, 0.15)",
          color: "#fbbf24",
          border: "rgba(245, 158, 11, 0.35)",
        };
      case "approved":
        return {
          label: "Approved · Ready at Gate 1",
          bg: "rgba(16, 185, 129, 0.15)",
          color: "#34d399",
          border: "rgba(16, 185, 129, 0.35)",
        };
      case "gate_checked_out":
        return {
          label: "Checked Out · On Leave",
          bg: "rgba(59, 130, 246, 0.15)",
          color: "#60a5fa",
          border: "rgba(59, 130, 246, 0.35)",
        };
      case "completed":
        return {
          label: "Returned & Completed",
          bg: "rgba(148, 163, 184, 0.15)",
          color: "#94a3b8",
          border: "rgba(148, 163, 184, 0.35)",
        };
      case "rejected":
        return {
          label: "Rejected by Warden",
          bg: "rgba(239, 68, 68, 0.15)",
          color: "#f87171",
          border: "rgba(239, 68, 68, 0.35)",
        };
    }
  };

  const displayPasses = canManage
    ? passes
    : passes.filter(
        (p) =>
          !studentRoll ||
          p.rollNumber === studentRoll ||
          (session?.profile?.full_name &&
            p.studentName === session.profile.full_name),
      );

  const filteredWardenPasses = passes.filter((p) => {
    if (wardenFilter === "all") return true;
    return p.status === wardenFilter;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Header Card */}
      <GlassCard
        material="glass"
        style={{
          padding: "24px",
          borderLeft: "4px solid #f59e0b",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: "16px",
          }}
        >
          <div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "4px 12px",
                borderRadius: "9999px",
                background: "rgba(245, 158, 11, 0.15)",
                color: "#fbbf24",
                border: "1px solid rgba(245, 158, 11, 0.3)",
                fontSize: "0.75rem",
                fontWeight: 800,
                letterSpacing: "0.04em",
                marginBottom: "10px",
              }}
            >
              <Building2 size={14} />
              <span>
                DIGITAL HOSTEL RESIDENCE OUTPASS &amp; GATE ACCESS SYSTEM
              </span>
            </div>

            <h2
              style={{
                fontSize: "1.6rem",
                fontWeight: 900,
                letterSpacing: "-0.02em",
                color: "#f8fafc",
                margin: "0 0 6px 0",
              }}
            >
              Hostel Outpass &amp; Security Gate Desk
            </h2>
            <p
              style={{
                margin: 0,
                color: "#cbd5e1",
                fontSize: "0.9rem",
                maxWidth: "720px",
                lineHeight: 1.45,
              }}
            >
              Mandatory digital gate outpass engine for JIS University hostels
              (Mandakini Girls, Bhagirathi Boys, and Alakananda PG Residence).
              Digital QR slip verified at Campus Gate 1 with statutory 08:00 PM
              entry curfew.
            </p>
          </div>

          {/* Subview Toggle Pills */}
          <div
            className="glass-subtle"
            style={{
              display: "inline-flex",
              padding: "4px",
              borderRadius: "14px",
              gap: "4px",
            }}
          >
            <button
              type="button"
              onClick={() => setSubView("passes")}
              style={{
                border: "none",
                background:
                  subView === "passes"
                    ? "linear-gradient(135deg, #f59e0b, #d97706)"
                    : "transparent",
                color: subView === "passes" ? "#0f172a" : "#cbd5e1",
                padding: "8px 16px",
                borderRadius: "10px",
                fontSize: "0.825rem",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              📋 {canManage ? "All Resident Passes" : "My Passes"} (
              {displayPasses.length})
            </button>
            <button
              type="button"
              onClick={() => setSubView("request")}
              style={{
                border: "none",
                background:
                  subView === "request"
                    ? "linear-gradient(135deg, #f59e0b, #d97706)"
                    : "transparent",
                color: subView === "request" ? "#0f172a" : "#cbd5e1",
                padding: "8px 16px",
                borderRadius: "10px",
                fontSize: "0.825rem",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              ➕ Request Outpass
            </button>
            {canManage && (
              <button
                type="button"
                onClick={() => setSubView("warden")}
                style={{
                  border: "none",
                  background:
                    subView === "warden"
                      ? "linear-gradient(135deg, #f59e0b, #d97706)"
                      : "transparent",
                  color: subView === "warden" ? "#0f172a" : "#cbd5e1",
                  padding: "8px 16px",
                  borderRadius: "10px",
                  fontSize: "0.825rem",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                🛡️ Warden &amp; Gate 1 Desk (Admin Permissions)
              </button>
            )}
          </div>
        </div>
      </GlassCard>

      {/* Sub-view 1: My Passes / All Passes */}
      {subView === "passes" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {displayPasses.length === 0 ? (
            <GlassCard
              material="glass"
              style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}
            >
              No gate passes registered yet. Click "Request Outpass" to file a
              new leave or day pass.
            </GlassCard>
          ) : (
            displayPasses.map((pass) => {
              const badge = getStatusBadge(pass.status);
              return (
                <GlassCard
                  key={pass.id}
                  material="glass"
                  style={{
                    padding: "20px 24px",
                    borderRadius: "18px",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    background: "rgba(20, 20, 32, 0.65)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      flexWrap: "wrap",
                      gap: "12px",
                      marginBottom: "14px",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          marginBottom: "4px",
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "monospace",
                            fontWeight: 800,
                            fontSize: "0.85rem",
                            color: "#60a5fa",
                            padding: "3px 8px",
                            borderRadius: "6px",
                            background: "rgba(37, 99, 235, 0.2)",
                          }}
                        >
                          #{pass.passNumber}
                        </span>
                        <span
                          style={{
                            padding: "3px 10px",
                            borderRadius: "9999px",
                            background: "rgba(245, 158, 11, 0.15)",
                            color: "#fbbf24",
                            fontSize: "0.75rem",
                            fontWeight: 700,
                          }}
                        >
                          {pass.passType}
                        </span>
                        <span style={{ fontSize: "0.8rem", color: "#cbd5e1" }}>
                          {pass.hostelBlock} · Room {pass.roomNumber}
                        </span>
                      </div>
                      <h3
                        style={{
                          margin: "0 0 4px 0",
                          fontSize: "1.05rem",
                          fontWeight: 800,
                          color: "#f8fafc",
                        }}
                      >
                        📍 Destination: {pass.destination}
                      </h3>
                      <p
                        style={{
                          margin: 0,
                          fontSize: "0.85rem",
                          color: "#94a3b8",
                        }}
                      >
                        Purpose: {pass.reason}
                      </p>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "6px 14px",
                          borderRadius: "9999px",
                          background: badge.bg,
                          color: badge.color,
                          border: `1px solid ${badge.border}`,
                          fontSize: "0.785rem",
                          fontWeight: 700,
                        }}
                      >
                        {badge.label}
                      </span>

                      {(pass.status === "approved" ||
                        pass.status === "gate_checked_out") && (
                        <button
                          type="button"
                          onClick={() => setActiveSlipPass(pass)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "8px 16px",
                            borderRadius: "10px",
                            background:
                              "linear-gradient(135deg, #2563eb, #1d4ed8)",
                            color: "#ffffff",
                            border: "none",
                            fontWeight: 700,
                            fontSize: "0.8rem",
                            cursor: "pointer",
                            boxShadow: "0 2px 8px rgba(37, 99, 235, 0.3)",
                          }}
                        >
                          <QrCode size={15} />
                          <span>View Digital QR Slip</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Timing & Warden Meta Grid */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: "12px",
                      padding: "12px 16px",
                      borderRadius: "12px",
                      background: "rgba(10, 14, 24, 0.6)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      fontSize: "0.825rem",
                    }}
                  >
                    <div>
                      <span
                        style={{
                          fontSize: "0.7rem",
                          color: "#94a3b8",
                          textTransform: "uppercase",
                        }}
                      >
                        Departure
                      </span>
                      <strong style={{ display: "block", color: "#f8fafc" }}>
                        {pass.departureTime}
                      </strong>
                    </div>
                    <div>
                      <span
                        style={{
                          fontSize: "0.7rem",
                          color: "#94a3b8",
                          textTransform: "uppercase",
                        }}
                      >
                        Curfew Return Time
                      </span>
                      <strong style={{ display: "block", color: "#fbbf24" }}>
                        {pass.expectedReturnTime}
                      </strong>
                    </div>
                    <div>
                      <span
                        style={{
                          fontSize: "0.7rem",
                          color: "#94a3b8",
                          textTransform: "uppercase",
                        }}
                      >
                        Parent Contact
                      </span>
                      <strong style={{ display: "block", color: "#f8fafc" }}>
                        {pass.parentPhone}
                      </strong>
                    </div>
                    <div>
                      <span
                        style={{
                          fontSize: "0.7rem",
                          color: "#94a3b8",
                          textTransform: "uppercase",
                        }}
                      >
                        Warden Clearance
                      </span>
                      <strong
                        style={{
                          display: "block",
                          color: pass.approvedBy ? "#34d399" : "#94a3b8",
                        }}
                      >
                        {pass.approvedBy || "Pending authorization"}
                      </strong>
                    </div>
                  </div>
                </GlassCard>
              );
            })
          )}
        </div>
      )}

      {/* Sub-view 2: Request Outpass Form */}
      {subView === "request" && (
        <GlassCard
          material="glass-strong"
          style={{
            padding: "28px",
            borderRadius: "20px",
            maxWidth: "720px",
            margin: "0 auto",
            width: "100%",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              marginBottom: "18px",
            }}
          >
            <PlusCircle size={22} style={{ color: "#fbbf24" }} />
            <div>
              <h3
                style={{
                  margin: 0,
                  fontSize: "1.2rem",
                  fontWeight: 800,
                  color: "#f8fafc",
                }}
              >
                File Hostel Outpass &amp; Leave Request
              </h3>
              <p style={{ margin: 0, fontSize: "0.825rem", color: "#94a3b8" }}>
                Directly submitted to Warden in-tray for verification and Gate 1
                QR token dispatch.
              </p>
            </div>
          </div>

          <form
            onSubmit={handleRequestPass}
            style={{ display: "flex", flexDirection: "column", gap: "16px" }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "14px",
              }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    color: "#f8fafc",
                    marginBottom: "6px",
                  }}
                >
                  Pass Type
                </label>
                <select
                  value={passType}
                  onChange={(e) => setPassType(e.target.value as any)}
                  style={{ width: "100%" }}
                >
                  <option value="Day Outpass">
                    Day Outpass (Return before 08:00 PM)
                  </option>
                  <option value="Weekend Home Visit">
                    Weekend Home Visit (Multi-day)
                  </option>
                  <option value="Emergency Medical Leave">
                    Emergency Medical Leave
                  </option>
                </select>
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    color: "#f8fafc",
                    marginBottom: "6px",
                  }}
                >
                  Hostel Residence Block
                </label>
                <select
                  value={hostelBlock}
                  onChange={(e) => setHostelBlock(e.target.value)}
                  style={{ width: "100%" }}
                >
                  <option value="JIS BOYS HOSTEL 1">JIS BOYS HOSTEL 1</option>
                  <option value="JIS BOYS HOSTEL 2">JIS BOYS HOSTEL 2</option>
                  <option value="JIS GIRLS HOSTEL 1">JIS GIRLS HOSTEL 1</option>
                  <option value="JIS GIRLS HOSTEL 2">JIS GIRLS HOSTEL 2</option>
                </select>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "120px 1fr",
                gap: "14px",
              }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    color: "#f8fafc",
                    marginBottom: "6px",
                  }}
                >
                  Room No.
                </label>
                <input
                  type="text"
                  required
                  value={roomNumber}
                  onChange={(e) => setRoomNumber(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "10px",
                    background: "rgba(20, 20, 32, 0.85)",
                    border: "1px solid rgba(255, 255, 255, 0.16)",
                    color: "#f8fafc",
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    color: "#f8fafc",
                    marginBottom: "6px",
                  }}
                >
                  Destination Address / Location
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. City Center 1, Salt Lake, Kolkata"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "10px",
                    background: "rgba(20, 20, 32, 0.85)",
                    border: "1px solid rgba(255, 255, 255, 0.16)",
                    color: "#f8fafc",
                  }}
                />
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "14px",
              }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    color: "#f8fafc",
                    marginBottom: "6px",
                  }}
                >
                  Departure Time
                </label>
                <input
                  type="text"
                  value={departureTime}
                  onChange={(e) => setDepartureTime(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "10px",
                    background: "rgba(20, 20, 32, 0.85)",
                    border: "1px solid rgba(255, 255, 255, 0.16)",
                    color: "#f8fafc",
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    color: "#f8fafc",
                    marginBottom: "6px",
                  }}
                >
                  Expected Curfew Return Time
                </label>
                <input
                  type="text"
                  value={expectedReturnTime}
                  onChange={(e) => setExpectedReturnTime(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "10px",
                    background: "rgba(20, 20, 32, 0.85)",
                    border: "1px solid rgba(255, 255, 255, 0.16)",
                    color: "#f8fafc",
                  }}
                />
              </div>
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  color: "#f8fafc",
                  marginBottom: "6px",
                }}
              >
                Parent / Guardian Phone Number (Verification)
              </label>
              <input
                type="tel"
                required
                value={parentPhone}
                onChange={(e) => setParentPhone(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "10px",
                  background: "rgba(20, 20, 32, 0.85)",
                  border: "1px solid rgba(255, 255, 255, 0.16)",
                  color: "#f8fafc",
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  color: "#f8fafc",
                  marginBottom: "6px",
                }}
              >
                Reason &amp; Purpose of Outpass
              </label>
              <textarea
                required
                rows={3}
                placeholder="State the detailed reason for leaving the university residence..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "10px",
                  background: "rgba(20, 20, 32, 0.85)",
                  border: "1px solid rgba(255, 255, 255, 0.16)",
                  color: "#f8fafc",
                  fontFamily: "inherit",
                }}
              />
            </div>

            <button
              type="submit"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                padding: "12px 24px",
                borderRadius: "12px",
                background: "linear-gradient(135deg, #f59e0b, #d97706)",
                color: "#0f172a",
                border: "none",
                fontWeight: 800,
                fontSize: "0.9rem",
                cursor: "pointer",
                marginTop: "8px",
              }}
            >
              <Send size={16} />
              <span>Submit Outpass Request</span>
            </button>
          </form>
        </GlassCard>
      )}

      {/* Sub-view 3: Warden & Security Gate Desk (Admin & Warden Permissions Only) */}
      {subView === "warden" &&
        (canManage ? (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "16px" }}
          >
            {/* Controls Bar */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "12px",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
                  Filter State:
                </span>
                {(
                  ["all", "pending", "approved", "gate_checked_out"] as const
                ).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setWardenFilter(f)}
                    style={{
                      padding: "4px 12px",
                      borderRadius: "8px",
                      background:
                        wardenFilter === f
                          ? "rgba(245, 158, 11, 0.25)"
                          : "rgba(255, 255, 255, 0.08)",
                      color: wardenFilter === f ? "#fbbf24" : "#cbd5e1",
                      border: `1px solid ${wardenFilter === f ? "rgba(245, 158, 11, 0.4)" : "rgba(255, 255, 255, 0.1)"}`,
                      fontSize: "0.785rem",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {f.replace(/_/g, " ").toUpperCase()}
                  </button>
                ))}
              </div>

              <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
                Gate 1 Scanner:{" "}
                <strong style={{ color: "#34d399" }}>ONLINE</strong> · Curfew
                Cutoff: 08:00 PM
              </span>
            </div>

            {filteredWardenPasses.map((pass) => {
              const badge = getStatusBadge(pass.status);
              return (
                <GlassCard
                  key={pass.id}
                  material="glass"
                  style={{
                    padding: "20px 24px",
                    borderRadius: "16px",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    background: "rgba(20, 20, 32, 0.7)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      flexWrap: "wrap",
                      gap: "12px",
                      marginBottom: "12px",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          marginBottom: "4px",
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "monospace",
                            fontWeight: 800,
                            color: "#60a5fa",
                          }}
                        >
                          #{pass.passNumber}
                        </span>
                        <strong
                          style={{ color: "#f8fafc", fontSize: "0.95rem" }}
                        >
                          {pass.studentName} ({pass.rollNumber})
                        </strong>
                        <span style={{ color: "#94a3b8", fontSize: "0.8rem" }}>
                          · {pass.hostelBlock} · Room {pass.roomNumber}
                        </span>
                      </div>
                      <div style={{ fontSize: "0.85rem", color: "#cbd5e1" }}>
                        <strong>Destination:</strong> {pass.destination} ·{" "}
                        <strong>Reason:</strong> {pass.reason}
                      </div>
                      <div
                        style={{
                          fontSize: "0.8rem",
                          color: "#94a3b8",
                          marginTop: "4px",
                        }}
                      >
                        Departure: {pass.departureTime} | Return by:{" "}
                        {pass.expectedReturnTime} | Parent: {pass.parentPhone}
                      </div>
                    </div>

                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "4px 12px",
                        borderRadius: "9999px",
                        background: badge.bg,
                        color: badge.color,
                        border: `1px solid ${badge.border}`,
                        fontSize: "0.75rem",
                        fontWeight: 700,
                      }}
                    >
                      {badge.label}
                    </span>
                  </div>

                  {/* Warden & Gate Fast Action Buttons */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      paddingTop: "12px",
                      borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                      flexWrap: "wrap",
                    }}
                  >
                    {pass.status === "pending" && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            handleWardenAction(
                              pass.id,
                              "approved",
                              "Verified with local guardian. Permitted until 08:00 PM curfew.",
                            )
                          }
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "6px 14px",
                            borderRadius: "8px",
                            background: "rgba(16, 185, 129, 0.2)",
                            color: "#34d399",
                            border: "1px solid rgba(16, 185, 129, 0.4)",
                            fontSize: "0.785rem",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          <CheckCircle2 size={14} />
                          <span>Approve Pass (Warden)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleWardenAction(
                              pass.id,
                              "rejected",
                              "Curfew restriction / Exam period lock.",
                            )
                          }
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "6px 14px",
                            borderRadius: "8px",
                            background: "rgba(239, 68, 68, 0.2)",
                            color: "#f87171",
                            border: "1px solid rgba(239, 68, 68, 0.4)",
                            fontSize: "0.785rem",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          <XCircle size={14} />
                          <span>Reject Pass</span>
                        </button>
                      </>
                    )}

                    {pass.status === "approved" && (
                      <button
                        type="button"
                        onClick={() =>
                          handleWardenAction(
                            pass.id,
                            "gate_checked_out",
                            "QR Scanned at Campus Gate 1 by Security Desk.",
                          )
                        }
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "6px 14px",
                          borderRadius: "8px",
                          background: "rgba(59, 130, 246, 0.2)",
                          color: "#60a5fa",
                          border: "1px solid rgba(59, 130, 246, 0.4)",
                          fontSize: "0.785rem",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        <DoorOpen size={14} />
                        <span>Gate 1 Scan: Check-Out Student</span>
                      </button>
                    )}

                    {pass.status === "gate_checked_out" && (
                      <button
                        type="button"
                        onClick={() =>
                          handleWardenAction(
                            pass.id,
                            "completed",
                            "Student safely returned and logged at Gate 1.",
                          )
                        }
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "6px 14px",
                          borderRadius: "8px",
                          background: "rgba(16, 185, 129, 0.2)",
                          color: "#34d399",
                          border: "1px solid rgba(16, 185, 129, 0.4)",
                          fontSize: "0.785rem",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        <CheckCircle2 size={14} />
                        <span>Safe Return: Check-In Student (Completed)</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setActiveSlipPass(pass)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "6px 12px",
                        borderRadius: "8px",
                        background: "rgba(255, 255, 255, 0.08)",
                        color: "#cbd5e1",
                        border: "1px solid rgba(255, 255, 255, 0.12)",
                        fontSize: "0.785rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      <QrCode size={13} />
                      <span>View QR Pass Slip</span>
                    </button>
                  </div>
                </GlassCard>
              );
            })}
          </div>
        ) : (
          <GlassCard
            material="glass"
            style={{ padding: "36px", textAlign: "center" }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                background: "rgba(239, 68, 68, 0.2)",
                color: "#f87171",
                marginBottom: "16px",
              }}
            >
              <ShieldAlert size={28} />
            </div>
            <h3
              style={{
                color: "#f87171",
                fontSize: "1.2rem",
                fontWeight: 800,
                margin: "0 0 8px 0",
              }}
            >
              Access Restricted: Administrator Permission Authority
            </h3>
            <p
              style={{
                color: "#cbd5e1",
                fontSize: "0.9rem",
                maxWidth: "560px",
                margin: "0 auto 16px auto",
                lineHeight: 1.5,
              }}
            >
              Students are strictly prohibited from granting or updating hostel
              gate pass permissions. Gate outpasses can only be authorized via
              the University Administration Command Center or Hostel Warden
              Desk.
            </p>
            <button
              type="button"
              onClick={() => setSubView("passes")}
              style={{
                padding: "8px 20px",
                borderRadius: "10px",
                background: "rgba(255, 255, 255, 0.1)",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                color: "#f8fafc",
                fontWeight: 700,
                fontSize: "0.85rem",
                cursor: "pointer",
              }}
            >
              Return to My Passes
            </button>
          </GlassCard>
        ))}

      {/* Digital QR Slip Modal */}
      {activeSlipPass && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(5, 8, 16, 0.85)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
            padding: "20px",
          }}
          role="dialog"
          aria-modal="true"
        >
          <GlassCard
            material="glass-strong"
            style={{
              maxWidth: "480px",
              width: "100%",
              borderRadius: "24px",
              overflow: "hidden",
              background: "rgba(15, 20, 32, 0.95)",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              boxShadow: "0 24px 64px rgba(0, 0, 0, 0.8)",
              padding: 0,
            }}
          >
            {/* Slip Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "16px 20px",
                background: "rgba(20, 26, 44, 0.85)",
                borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <Building2 size={16} color="#fbbf24" />
                <strong style={{ fontSize: "0.85rem", color: "#f8fafc" }}>
                  JIS UNIVERSITY HOSTEL GATE OUTPASS SLIP
                </strong>
              </div>
              <button
                type="button"
                onClick={() => setActiveSlipPass(null)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#cbd5e1",
                  cursor: "pointer",
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: "24px", textAlign: "center" }}>
              <span
                style={{
                  display: "inline-block",
                  fontFamily: "monospace",
                  fontWeight: 900,
                  fontSize: "1.15rem",
                  color: "#60a5fa",
                  marginBottom: "6px",
                }}
              >
                #{activeSlipPass.passNumber}
              </span>
              <h3
                style={{
                  margin: "0 0 4px 0",
                  fontSize: "1.2rem",
                  color: "#f8fafc",
                }}
              >
                {activeSlipPass.studentName}
              </h3>
              <p
                style={{
                  margin: "0 0 16px 0",
                  fontSize: "0.825rem",
                  color: "#94a3b8",
                }}
              >
                Roll: {activeSlipPass.rollNumber} · {activeSlipPass.hostelBlock}{" "}
                (Room {activeSlipPass.roomNumber})
              </p>

              {/* Big QR Code */}
              <div
                style={{
                  width: "180px",
                  height: "180px",
                  margin: "0 auto 16px",
                  borderRadius: "16px",
                  background: "#ffffff",
                  padding: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
                }}
              >
                <QrCode size={156} color="#0a1128" />
              </div>

              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "4px 12px",
                  borderRadius: "9999px",
                  background: "rgba(16, 185, 129, 0.15)",
                  color: "#34d399",
                  border: "1px solid rgba(16, 185, 129, 0.35)",
                  fontSize: "0.75rem",
                  fontWeight: 800,
                  marginBottom: "16px",
                }}
              >
                <CheckCircle2 size={13} />
                <span>AUTHORIZED BY WARDEN DESK</span>
              </div>

              <div
                style={{
                  textAlign: "left",
                  background: "rgba(20, 26, 44, 0.7)",
                  padding: "14px",
                  borderRadius: "12px",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  fontSize: "0.8rem",
                  lineHeight: 1.5,
                  color: "#cbd5e1",
                }}
              >
                <div>
                  <strong>Destination:</strong> {activeSlipPass.destination}
                </div>
                <div>
                  <strong>Departure:</strong> {activeSlipPass.departureTime}
                </div>
                <div>
                  <strong>Curfew Return:</strong>{" "}
                  <span style={{ color: "#fbbf24", fontWeight: 700 }}>
                    {activeSlipPass.expectedReturnTime}
                  </span>
                </div>
                <div>
                  <strong>Emergency Phone:</strong> {activeSlipPass.parentPhone}
                </div>
                {activeSlipPass.wardenNotes && (
                  <div
                    style={{
                      marginTop: "6px",
                      paddingTop: "6px",
                      borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                      color: "#94a3b8",
                    }}
                  >
                    <em>Notes: {activeSlipPass.wardenNotes}</em>
                  </div>
                )}
              </div>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}

export default HostelGatePassView;
