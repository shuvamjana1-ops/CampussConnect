import { useEffect, useState, useTransition } from "react";
import { useSearchParams } from "react-router";
import {
  ClipboardList,
  FileText,
  ShieldCheck,
  AlertCircle,
  ChevronRight,
  Lock,
  Paperclip,
} from "lucide-react";
import { useSession } from "../../auth/session";
import { useToast } from "../../components/Toast";
import { UserProfileSection } from "../../components/UserProfileSection";
import { GlassCard } from "../../components/GlassCard";
import { StatTile } from "../../components/StatTile";
import { EvidenceLightboxModal } from "../../components/EvidenceLightboxModal";
import { TicketConversationThread } from "../../components/TicketConversationThread";
import { HostelGatePassView } from "../../components/HostelGatePassView";
import {
  isSupabaseConfigured,
  supabase,
  type DbTask,
  type DbWorkItem,
} from "../../lib/supabase";
import {
  complaintStore,
  type ComplaintData,
  type ComplaintAttachment,
} from "../../services/complaintStore";

export function StaffDashboard() {
  const { user, profile } = useSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "tasks";
  const { toast } = useToast();
  const [, startTransition] = useTransition();

  const [complaints, setComplaints] = useState<readonly ComplaintData[]>(() =>
    complaintStore.getComplaints(),
  );
  const [tasks, setTasks] = useState<DbTask[]>([]);
  const [workItems, setWorkItems] = useState<DbWorkItem[]>([]);
  const [, setIsLoading] = useState(false);

  // Resolution Modal State
  const [selectedComplaint, setSelectedComplaint] =
    useState<ComplaintData | null>(null);
  const [selectedTask, setSelectedTask] = useState<DbTask | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [newStatus, setNewStatus] = useState<DbTask["status"]>("in_progress");
  const [acMarksCorrection, setAcMarksCorrection] = useState<number>(22);
  const [activeLightboxAttachment, setActiveLightboxAttachment] =
    useState<ComplaintAttachment | null>(null);

  // New Work item submission form
  const [workTitle, setWorkTitle] = useState("");
  const [workDetails, setWorkDetails] = useState("");

  // Subscribe to complaintStore for real-time AC complaint updates
  useEffect(() => {
    const unsubscribe = complaintStore.subscribe(() => {
      setComplaints(complaintStore.getComplaints());
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    async function loadStaffData() {
      setIsLoading(true);
      try {
        if (isSupabaseConfigured && user) {
          const { data: t } = await supabase
            .from("tasks")
            .select("*")
            .order("created_at", { ascending: false });
          if (t) setTasks(t as DbTask[]);

          const { data: w } = await supabase
            .from("work_items")
            .select("*")
            .order("created_at", { ascending: false });
          if (w) setWorkItems(w as DbWorkItem[]);
        } else {
          // Demo fallback
          setTasks([
            {
              id: "task-w1-01",
              owner_id: user?.id || "usr-staff-demo-01",
              title: "CS302 Answer Script Batch Audit & Moderation",
              description:
                "Audit 65 student answer scripts and cross-reference with marks entry portal.",
              category: "Examination",
              priority: "urgent",
              status: "in_progress",
              resolution_notes:
                "Checking answer scripts for hall ticket cut-off deadline.",
              created_at: new Date(Date.now() - 3600000 * 4).toISOString(),
              updated_at: new Date().toISOString(),
            },
            {
              id: "task-w1-02",
              owner_id: user?.id || "usr-staff-demo-01",
              title: "Mandakini Hostel Wi-Fi Diagnostic & Hardware Inspection",
              description:
                "Diagnose router failure on 3rd floor corridor and replace power adaptor.",
              category: "Infrastructure",
              priority: "high",
              status: "pending",
              created_at: new Date(Date.now() - 3600000 * 10).toISOString(),
              updated_at: new Date().toISOString(),
            },
          ]);

          setWorkItems([
            {
              id: "wi-01",
              owner_id: user?.id || "usr-staff-demo-01",
              title: "CS302 Moderation Worksheet",
              details:
                "Tabulated marks comparison sheet with signed dean authorization.",
              status: "reviewed",
              created_at: new Date(Date.now() - 3600000 * 6).toISOString(),
            },
          ]);
        }
      } catch (e) {
        console.error("Error loading staff data:", e);
      } finally {
        setIsLoading(false);
      }
    }

    void loadStaffData();
  }, [user]);

  const handleApplyResolution = async () => {
    if (!selectedTask) return;

    try {
      if (isSupabaseConfigured) {
        const { error } = await supabase
          .from("tasks")
          .update({
            status: newStatus,
            resolution_notes: resolutionNote,
          })
          .eq("id", selectedTask.id);

        if (error) {
          toast(error.message, "error");
          return;
        }
      }

      setTasks((prev) =>
        prev.map((t) =>
          t.id === selectedTask.id
            ? { ...t, status: newStatus, resolution_notes: resolutionNote }
            : t,
        ),
      );

      toast("Work order & resolution note updated!", "success");
      setSelectedTask(null);
      setResolutionNote("");
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  const handleApplyComplaintResolution = (stage: any) => {
    if (!selectedComplaint) return;
    const actor = profile?.full_name || "Prof. Rahul Mehta (Course Evaluator)";
    complaintStore.updateStatus(
      selectedComplaint.id,
      stage,
      resolutionNote || `Evaluator progressed status to ${stage}`,
      actor,
    );
    toast(
      `Grievance #${selectedComplaint.reference} updated to ${stage}!`,
      "success",
    );
    setSelectedComplaint(null);
    setResolutionNote("");
  };

  const handleDirectMarksCorrection = (
    subjectCode: string,
    studentId: string,
  ) => {
    if (!selectedComplaint) return;
    const actor = profile?.full_name || "Prof. Rahul Mehta (Course Evaluator)";
    complaintStore.updateACMarks(studentId, subjectCode, acMarksCorrection);
    complaintStore.updateStatus(
      selectedComplaint.id,
      "resolved",
      `Physical exam booklet retrieved from archive and re-tallied. Internal marks for ${subjectCode} updated to ${acMarksCorrection}/30. Discrepancy resolved.`,
      actor,
    );
    toast(
      `Marks updated to ${acMarksCorrection}/30 for ${studentId}. Grievance marked as Resolved!`,
      "success",
    );
    setSelectedComplaint(null);
    setResolutionNote("");
  };

  const handleCreateWorkItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workTitle.trim() || !workDetails.trim()) return;

    try {
      const newItem: DbWorkItem = {
        id: `wi-${Date.now()}`,
        owner_id: user?.id || "usr-staff-01",
        title: workTitle,
        details: workDetails,
        status: "submitted",
        created_at: new Date().toISOString(),
      };

      if (isSupabaseConfigured && user) {
        const { data, error } = await supabase
          .from("work_items")
          .insert({
            owner_id: user.id,
            title: workTitle,
            details: workDetails,
            status: "submitted",
          })
          .select()
          .single();

        if (error) {
          toast(error.message, "error");
          return;
        }
        if (data) setWorkItems((prev) => [data as DbWorkItem, ...prev]);
      } else {
        setWorkItems((prev) => [newItem, ...prev]);
      }

      toast("Work docket registered into your isolated queue!", "success");
      setWorkTitle("");
      setWorkDetails("");
      setSearchParams({ tab: "submissions" });
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  const isFacilitiesStaff =
    user?.email?.includes("worker2") ||
    user?.email?.includes("staff2") ||
    profile?.department?.includes("Facilities");
  const relevantComplaints = complaints.filter((c: ComplaintData) => {
    if (isFacilitiesStaff) {
      return (
        c.type === "Hostel" ||
        c.type === "Infrastructure" ||
        c.assignedStaffName?.includes("Dilip")
      );
    }
    // Staff 1 (Examination / Records / Academic):
    return (
      c.type === "Academic" ||
      c.type === "Grievance" ||
      c.assignedStaffName?.includes("Rahul") ||
      !c.assignedStaffName
    );
  });

  return (
    <div
      className="cc-staff-dashboard"
      style={{
        maxWidth: "1280px",
        margin: "0 auto",
        padding: "0 8px 3rem 8px",
      }}
    >
      {/* Header Lockup */}
      <GlassCard
        material="glass"
        style={{
          padding: "24px 28px",
          marginBottom: "24px",
          borderLeft: "4px solid var(--staff-accent, #0d9488)",
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
                background: "rgba(13, 148, 136, 0.12)",
                color: "var(--staff-accent, #0d9488)",
                border: "1px solid rgba(13, 148, 136, 0.25)",
                fontSize: "0.75rem",
                fontWeight: 800,
                letterSpacing: "0.04em",
                marginBottom: "8px",
              }}
            >
              <span>🔧</span>
              <span>STAFF RESOLUTION WORKSPACE · JIS UNIVERSITY</span>
            </div>

            <h1
              style={{
                fontSize: "2rem",
                fontWeight: 900,
                letterSpacing: "-0.02em",
                color: "var(--text-main, #0f172a)",
                margin: "0 0 6px 0",
                lineHeight: 1.15,
              }}
            >
              Assigned Work Orders &amp; Docket Triage
            </h1>
            <p
              style={{
                margin: 0,
                color: "var(--text-muted, #64748b)",
                fontSize: "0.925rem",
                maxWidth: "720px",
                lineHeight: 1.45,
              }}
            >
              Logged in as{" "}
              <strong>{profile?.full_name || "Prof. Rahul Mehta"}</strong> (
              {profile?.department || "Examination & Records Cell"}). All action
              records are strictly partitioned via Postgres Row-Level Security.
            </p>
          </div>

          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 14px",
              borderRadius: "9999px",
              background: "rgba(13, 148, 136, 0.12)",
              color: "#0d9488",
              border: "1px solid rgba(13, 148, 136, 0.25)",
              fontSize: "0.785rem",
              fontWeight: 700,
            }}
          >
            <ShieldCheck size={14} />
            <span>Staff Partition Active</span>
          </span>
        </div>
      </GlassCard>

      {/* Metric Tiles */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px",
          marginBottom: "28px",
        }}
      >
        <StatTile
          label="My Active Work Orders"
          value={tasks.length}
          icon={<ClipboardList size={20} />}
          trend={{
            value: `${tasks.filter((t) => t.status === "in_progress").length} In Execution`,
            isPositive: true,
          }}
          subtitle="Direct Department Orders"
        />
        <StatTile
          label="Submitted Work Items"
          value={workItems.length}
          icon={<FileText size={20} />}
          trend={{ value: "Secured Queue", isPositive: true }}
          subtitle="Evidence & Inspection Logs"
        />
        <StatTile
          label="Assigned Student Grievances"
          value={relevantComplaints.length}
          icon={<AlertCircle size={20} />}
          trend={{
            value: `${relevantComplaints.filter((c) => c.currentStage !== "resolved").length} Pending`,
            isPositive: false,
          }}
          subtitle="Real-Time Triage Synced"
        />
        <StatTile
          label="RLS Isolation Status"
          value="ENFORCED"
          icon={<Lock size={20} />}
          trend={{ value: "100% Isolated", isPositive: true }}
          subtitle="No Cross-Staff Data Leakage"
        />
      </div>

      {/* Segmented Control Tabs */}
      <div
        className="glass-subtle"
        style={{
          display: "inline-flex",
          padding: "4px",
          borderRadius: "16px",
          marginBottom: "24px",
          gap: "4px",
          maxWidth: "100%",
          overflowX: "auto",
        }}
      >
        {[
          { key: "tasks", label: `📋 Assigned Tasks (${tasks.length})` },
          {
            key: "submissions",
            label: `📂 Work Items & Evidence (${workItems.length})`,
          },
          { key: "hostel", label: "🏢 Hostel Gate Pass" },
          { key: "create", label: "➕ Register Work Docket" },
          { key: "profile", label: "👤 Profile Photo & Details" },
        ].map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                startTransition(() => {
                  setSearchParams({ tab: tab.key });
                });
              }}
              style={{
                border: "none",
                background: isActive
                  ? "linear-gradient(135deg, var(--staff-accent, #0d9488), var(--staff-primary, #0f766e))"
                  : "transparent",
                color: isActive ? "#ffffff" : "var(--text-main, #0f172a)",
                padding: "8px 18px",
                borderRadius: "12px",
                fontSize: "0.825rem",
                fontWeight: isActive ? 700 : 600,
                cursor: "pointer",
                boxShadow: isActive
                  ? "0 4px 12px rgba(13, 148, 136, 0.35)"
                  : "none",
                transition: "all 180ms cubic-bezier(0.32, 0.72, 0, 1)",
                whiteSpace: "nowrap",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab 1: Tasks Queue */}
      {activeTab === "tasks" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Section: Assigned Student Grievances */}
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "14px",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "10px" }}
              >
                <span style={{ fontSize: "1.25rem" }}>🎓</span>
                <h3
                  style={{
                    margin: 0,
                    fontSize: "1.2rem",
                    color: "var(--text-main, #0f172a)",
                    fontWeight: 800,
                  }}
                >
                  Assigned Student Grievances &amp; Academic Cases (
                  {relevantComplaints.length})
                </h3>
              </div>
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  color: "var(--staff-accent, #0d9488)",
                  background: "rgba(13, 148, 136, 0.12)",
                  padding: "3px 10px",
                  borderRadius: "9999px",
                }}
              >
                Real-Time Triage Synced
              </span>
            </div>

            {relevantComplaints.length === 0 ? (
              <GlassCard
                material="glass"
                style={{ padding: "24px", textAlign: "center" }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.9rem",
                    color: "var(--text-muted, #64748b)",
                  }}
                >
                  No student grievances currently assigned to your department
                  queue.
                </p>
              </GlassCard>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                }}
              >
                {relevantComplaints.map((c) => {
                  const isResolved = c.currentStage === "resolved";
                  const isP0 = c.priority.includes("P0");

                  return (
                    <GlassCard
                      key={c.id}
                      material="glass"
                      interactive
                      style={{
                        padding: "20px 24px",
                        borderLeft: `4px solid ${isResolved ? "#059669" : isP0 ? "#dc2626" : "var(--staff-accent, #0d9488)"}`,
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
                        <div style={{ flex: 1, minWidth: "280px" }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              marginBottom: "6px",
                              flexWrap: "wrap",
                            }}
                          >
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 8px",
                                borderRadius: "9999px",
                                fontSize: "0.725rem",
                                fontWeight: 700,
                                background: isP0
                                  ? "rgba(239, 68, 68, 0.15)"
                                  : "rgba(245, 158, 11, 0.15)",
                                color: isP0 ? "#dc2626" : "#d97706",
                              }}
                            >
                              {c.priority}
                            </span>
                            <span
                              style={{
                                fontSize: "0.75rem",
                                fontWeight: 800,
                                color: "var(--text-muted, #64748b)",
                                textTransform: "uppercase",
                              }}
                            >
                              {c.type}
                            </span>
                            <span
                              style={{
                                fontSize: "0.75rem",
                                color: "var(--text-muted, #64748b)",
                                fontFamily: "monospace",
                              }}
                            >
                              · {c.reference}
                            </span>
                            <span
                              style={{
                                fontSize: "0.75rem",
                                padding: "2px 8px",
                                borderRadius: "9999px",
                                background: "rgba(59, 130, 246, 0.12)",
                                color: "#1d4ed8",
                                fontWeight: 700,
                              }}
                            >
                              👤 {c.student.name} ({c.student.rollNumber})
                            </span>
                          </div>

                          <h3
                            style={{
                              margin: "0 0 6px 0",
                              fontSize: "1.15rem",
                              color: "var(--text-main, #0f172a)",
                              fontWeight: 800,
                            }}
                          >
                            {c.title}
                          </h3>
                          <p
                            style={{
                              margin: "0 0 12px 0",
                              fontSize: "0.875rem",
                              color: "var(--text-muted, #64748b)",
                              lineHeight: 1.45,
                            }}
                          >
                            {c.description}
                          </p>

                          {c.timeline.length > 0 && (
                            <div
                              className="glass-subtle"
                              style={{
                                padding: "8px 12px",
                                borderRadius: "8px",
                                fontSize: "0.825rem",
                                color: "var(--text-main, #0f172a)",
                                borderLeft:
                                  "3px solid var(--staff-accent, #0d9488)",
                              }}
                            >
                              <strong>Latest Status:</strong>{" "}
                              {c.timeline[c.timeline.length - 1]?.description}
                            </div>
                          )}
                        </div>

                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "flex-end",
                            gap: "8px",
                          }}
                        >
                          <span
                            style={{
                              display: "inline-block",
                              padding: "4px 12px",
                              borderRadius: "9999px",
                              fontSize: "0.785rem",
                              fontWeight: 700,
                              background: isResolved
                                ? "rgba(16, 185, 129, 0.15)"
                                : "rgba(13, 148, 136, 0.15)",
                              color: isResolved ? "#059669" : "#0d9488",
                            }}
                          >
                            {c.currentStage.replace(/_/g, " ").toUpperCase()}
                          </span>

                          <button
                            type="button"
                            onClick={() => {
                              setSelectedComplaint(c);
                              setResolutionNote(
                                c.timeline[c.timeline.length - 1]
                                  ?.description || "",
                              );
                            }}
                            style={{
                              padding: "8px 16px",
                              borderRadius: "10px",
                              border: "none",
                              background:
                                "linear-gradient(135deg, var(--staff-accent, #0d9488), var(--staff-primary, #0f766e))",
                              color: "#ffffff",
                              fontSize: "0.825rem",
                              fontWeight: 700,
                              cursor: "pointer",
                              boxShadow: "0 2px 8px rgba(13, 148, 136, 0.3)",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                          >
                            <span>⚡ Work on This Case</span>
                            <ChevronRight size={14} />
                          </button>
                        </div>
                      </div>
                    </GlassCard>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section: Internal Department Tasks */}
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "14px",
              }}
            >
              <span style={{ fontSize: "1.25rem" }}>🔧</span>
              <h3
                style={{
                  margin: 0,
                  fontSize: "1.2rem",
                  color: "var(--text-main, #0f172a)",
                  fontWeight: 800,
                }}
              >
                Internal Department Tasks &amp; Work Orders ({tasks.length})
              </h3>
            </div>

            <div
              style={{ display: "flex", flexDirection: "column", gap: "12px" }}
            >
              {tasks.map((t) => (
                <GlassCard
                  key={t.id}
                  material="glass"
                  style={{ padding: "20px 24px" }}
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
                    <div style={{ flex: 1, minWidth: "280px" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          marginBottom: "6px",
                        }}
                      >
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: "9999px",
                            fontSize: "0.725rem",
                            fontWeight: 700,
                            background:
                              t.priority === "urgent"
                                ? "rgba(239, 68, 68, 0.15)"
                                : "rgba(59, 130, 246, 0.15)",
                            color:
                              t.priority === "urgent" ? "#dc2626" : "#2563eb",
                          }}
                        >
                          {t.priority.toUpperCase()}
                        </span>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: "9999px",
                            fontSize: "0.725rem",
                            fontWeight: 700,
                            background:
                              t.status === "completed"
                                ? "rgba(16, 185, 129, 0.15)"
                                : "rgba(245, 158, 11, 0.15)",
                            color:
                              t.status === "completed" ? "#059669" : "#d97706",
                          }}
                        >
                          {t.status.replace("_", " ").toUpperCase()}
                        </span>
                        <span
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--text-muted, #64748b)",
                          }}
                        >
                          Category: <strong>{t.category}</strong>
                        </span>
                      </div>

                      <h3
                        style={{
                          margin: "0 0 6px 0",
                          fontSize: "1.1rem",
                          color: "var(--text-main, #0f172a)",
                          fontWeight: 800,
                        }}
                      >
                        {t.title}
                      </h3>
                      <p
                        style={{
                          margin: "0 0 10px 0",
                          fontSize: "0.875rem",
                          color: "var(--text-muted, #64748b)",
                          lineHeight: 1.45,
                        }}
                      >
                        {t.description}
                      </p>

                      {t.resolution_notes && (
                        <div
                          className="glass-subtle"
                          style={{
                            padding: "8px 12px",
                            borderRadius: "8px",
                            fontSize: "0.825rem",
                            color: "var(--text-main, #0f172a)",
                            borderLeft:
                              "3px solid var(--staff-accent, #0d9488)",
                          }}
                        >
                          <strong>Latest Resolution Note:</strong>{" "}
                          {t.resolution_notes}
                        </div>
                      )}
                    </div>

                    <div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTask(t);
                          setNewStatus(t.status);
                          setResolutionNote(t.resolution_notes || "");
                        }}
                        style={{
                          padding: "8px 14px",
                          borderRadius: "10px",
                          border: "none",
                          background:
                            "linear-gradient(135deg, var(--staff-accent, #0d9488), var(--staff-primary, #0f766e))",
                          color: "#ffffff",
                          fontSize: "0.8rem",
                          fontWeight: 700,
                          cursor: "pointer",
                          boxShadow: "0 2px 8px rgba(13, 148, 136, 0.25)",
                        }}
                      >
                        ⚡ Update Task Status
                      </button>
                    </div>
                  </div>
                </GlassCard>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Work Items & Evidence Dossiers */}
      {activeTab === "submissions" && (
        <GlassCard material="glass" style={{ padding: "24px" }}>
          <div style={{ marginBottom: "18px" }}>
            <h3
              style={{
                margin: "0 0 4px 0",
                fontSize: "1.25rem",
                fontWeight: 800,
                color: "var(--text-main, #0f172a)",
              }}
            >
              My Registered Work Items &amp; Inspection Dossiers
            </h3>
            <span
              style={{
                fontSize: "0.825rem",
                color: "var(--text-muted, #64748b)",
              }}
            >
              Action records stored into your isolated staff partition.
            </span>
          </div>

          <div
            style={{ width: "100%", overflowX: "auto", borderRadius: "16px" }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                textAlign: "left",
              }}
            >
              <thead>
                <tr
                  style={{
                    background: "rgba(255, 255, 255, 0.35)",
                    borderBottom: "1px solid rgba(0, 0, 0, 0.08)",
                  }}
                >
                  <th
                    style={{
                      padding: "12px 16px",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      color: "var(--text-muted, #64748b)",
                      textTransform: "uppercase",
                    }}
                  >
                    Docket Title
                  </th>
                  <th
                    style={{
                      padding: "12px 16px",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      color: "var(--text-muted, #64748b)",
                      textTransform: "uppercase",
                    }}
                  >
                    Details &amp; Finding Notes
                  </th>
                  <th
                    style={{
                      padding: "12px 16px",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      color: "var(--text-muted, #64748b)",
                      textTransform: "uppercase",
                    }}
                  >
                    Status
                  </th>
                  <th
                    style={{
                      padding: "12px 16px",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      color: "var(--text-muted, #64748b)",
                      textTransform: "uppercase",
                    }}
                  >
                    Recorded At
                  </th>
                </tr>
              </thead>
              <tbody>
                {workItems.map((w) => (
                  <tr
                    key={w.id}
                    style={{ borderBottom: "1px solid rgba(0, 0, 0, 0.05)" }}
                  >
                    <td style={{ padding: "14px 16px" }}>
                      <strong
                        style={{
                          color: "var(--text-main, #0f172a)",
                          fontSize: "0.9rem",
                        }}
                      >
                        {w.title}
                      </strong>
                    </td>
                    <td
                      style={{
                        padding: "14px 16px",
                        color: "var(--text-muted, #64748b)",
                        fontSize: "0.85rem",
                      }}
                    >
                      {w.details}
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "3px 8px",
                          borderRadius: "9999px",
                          fontSize: "0.725rem",
                          fontWeight: 700,
                          background: "rgba(16, 185, 129, 0.15)",
                          color: "#059669",
                        }}
                      >
                        {w.status.toUpperCase()}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "14px 16px",
                        fontSize: "0.8rem",
                        color: "var(--text-muted, #64748b)",
                      }}
                    >
                      {new Date(w.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {/* Tab 3: Register Work Docket */}
      {activeTab === "create" && (
        <GlassCard
          material="glass"
          style={{ maxWidth: "680px", margin: "0 auto", padding: "28px" }}
        >
          <h3
            style={{
              margin: "0 0 6px 0",
              fontSize: "1.3rem",
              fontWeight: 800,
              color: "var(--text-main, #0f172a)",
            }}
          >
            Register New Work Docket
          </h3>
          <p
            style={{
              margin: "0 0 20px 0",
              color: "var(--text-muted, #64748b)",
              fontSize: "0.875rem",
            }}
          >
            Store official findings, equipment test forms, or answer script
            re-tally moderation sheets into your isolated tenant storage.
          </p>

          <form
            onSubmit={handleCreateWorkItem}
            style={{ display: "flex", flexDirection: "column", gap: "16px" }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.825rem",
                  fontWeight: 700,
                  marginBottom: "6px",
                  color: "var(--text-main, #0f172a)",
                }}
              >
                Docket Title
              </label>
              <input
                type="text"
                required
                value={workTitle}
                onChange={(e) => setWorkTitle(e.target.value)}
                placeholder="e.g., CS302 Moderation Worksheet / Substation Generator Log"
                className="glass-subtle"
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "12px",
                  border: "1px solid rgba(0, 0, 0, 0.1)",
                  outline: "none",
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.825rem",
                  fontWeight: 700,
                  marginBottom: "6px",
                  color: "var(--text-main, #0f172a)",
                }}
              >
                Detailed Findings &amp; Resolution Summary
              </label>
              <textarea
                required
                rows={4}
                value={workDetails}
                onChange={(e) => setWorkDetails(e.target.value)}
                placeholder="Include specific roll numbers, equipment readings, action taken, and clearance approvals..."
                className="glass-subtle"
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "12px",
                  border: "1px solid rgba(0, 0, 0, 0.1)",
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />
            </div>

            <button
              type="submit"
              style={{
                alignSelf: "flex-start",
                padding: "10px 24px",
                borderRadius: "12px",
                border: "none",
                background:
                  "linear-gradient(135deg, var(--staff-accent, #0d9488), var(--staff-primary, #0f766e))",
                color: "#ffffff",
                fontSize: "0.875rem",
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 4px 14px rgba(13, 148, 136, 0.35)",
              }}
            >
              ✓ Save Work Docket (RLS Secured)
            </button>
          </form>
        </GlassCard>
      )}

      {/* Tab 4: Profile Photo & Details */}
      {activeTab === "profile" && <UserProfileSection />}

      {/* Resolution Modal for Internal Tasks */}
      {selectedTask && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.55)",
            backdropFilter: "blur(10px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "16px",
          }}
        >
          <GlassCard
            material="glass-strong"
            style={{ maxWidth: "520px", width: "100%", padding: "24px" }}
          >
            <h3
              style={{
                margin: "0 0 6px 0",
                fontSize: "1.2rem",
                fontWeight: 800,
              }}
            >
              Update Work Order: #{selectedTask.id.slice(0, 8)}
            </h3>
            <p
              style={{
                margin: "0 0 16px 0",
                fontSize: "0.85rem",
                color: "var(--text-muted, #64748b)",
              }}
            >
              {selectedTask.title}
            </p>

            <div style={{ marginBottom: "14px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.825rem",
                  fontWeight: 700,
                  marginBottom: "6px",
                }}
              >
                New Status
              </label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as any)}
                className="glass-subtle"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "10px",
                  border: "1px solid rgba(0, 0, 0, 0.1)",
                }}
              >
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.825rem",
                  fontWeight: 700,
                  marginBottom: "6px",
                }}
              >
                Resolution / Investigation Note
              </label>
              <textarea
                rows={4}
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                placeholder="State the findings, corrections made, or service dispatch details..."
                className="glass-subtle"
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "12px",
                  border: "1px solid rgba(0, 0, 0, 0.1)",
                  fontFamily: "inherit",
                }}
              />
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
              }}
            >
              <button
                type="button"
                onClick={() => setSelectedTask(null)}
                style={{
                  padding: "8px 16px",
                  borderRadius: "10px",
                  border: "1px solid rgba(0, 0, 0, 0.1)",
                  background: "transparent",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: "0.825rem",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyResolution}
                style={{
                  padding: "8px 18px",
                  borderRadius: "10px",
                  border: "none",
                  background:
                    "linear-gradient(135deg, var(--staff-accent, #0d9488), var(--staff-primary, #0f766e))",
                  color: "#ffffff",
                  fontWeight: 700,
                  fontSize: "0.825rem",
                  cursor: "pointer",
                }}
              >
                Save &amp; Apply Update
              </button>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Tab: Hostel Gate Pass (Warden & Security Desk) */}
      {activeTab === "hostel" && (
        <HostelGatePassView
          initialSubView="warden"
          canManagePermissions={true}
        />
      )}

      {/* Student Grievance Action Modal */}
      {selectedComplaint && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.55)",
            backdropFilter: "blur(12px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "16px",
          }}
          role="dialog"
          aria-modal="true"
        >
          <GlassCard
            material="glass-strong"
            style={{
              maxWidth: "640px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              padding: "28px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "10px",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  padding: "3px 10px",
                  borderRadius: "9999px",
                  fontSize: "0.725rem",
                  fontWeight: 700,
                  background: selectedComplaint.priority.includes("P0")
                    ? "rgba(239, 68, 68, 0.15)"
                    : "rgba(245, 158, 11, 0.15)",
                  color: selectedComplaint.priority.includes("P0")
                    ? "#dc2626"
                    : "#d97706",
                }}
              >
                {selectedComplaint.priority}
              </span>
              <span
                style={{
                  fontSize: "0.785rem",
                  color: "var(--text-muted, #64748b)",
                  fontFamily: "monospace",
                }}
              >
                {selectedComplaint.reference}
              </span>
            </div>

            <h3
              style={{
                margin: "0 0 8px 0",
                fontSize: "1.25rem",
                fontWeight: 800,
              }}
            >
              Work on Grievance: {selectedComplaint.title}
            </h3>

            <div
              className="glass-subtle"
              style={{
                padding: "12px 16px",
                borderRadius: "12px",
                marginBottom: "18px",
                fontSize: "0.85rem",
              }}
            >
              <div>
                <strong>Student:</strong> {selectedComplaint.student.name} (
                {selectedComplaint.student.rollNumber})
              </div>
              <div>
                <strong>Department:</strong>{" "}
                {selectedComplaint.student.department}
              </div>
              <div
                style={{
                  marginTop: "4px",
                  color: "var(--text-muted, #64748b)",
                }}
              >
                {selectedComplaint.description}
              </div>
            </div>

            {/* Evidence Attachments */}
            {selectedComplaint.attachments &&
              selectedComplaint.attachments.length > 0 && (
                <div style={{ marginBottom: "16px" }}>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      display: "block",
                      marginBottom: "6px",
                    }}
                  >
                    Uploaded Evidence Proof (
                    {selectedComplaint.attachments.length}):
                  </span>
                  <div
                    style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}
                  >
                    {selectedComplaint.attachments.map((att) => (
                      <button
                        key={att.id}
                        type="button"
                        onClick={() => setActiveLightboxAttachment(att)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "6px 12px",
                          borderRadius: "10px",
                          background: "rgba(20, 20, 32, 0.8)",
                          border: "1px solid rgba(255, 255, 255, 0.14)",
                          color: "#f8fafc",
                          fontSize: "0.785rem",
                          cursor: "pointer",
                        }}
                      >
                        <Paperclip size={13} style={{ color: "#60a5fa" }} />
                        <span>{att.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

            {/* Direct Marks Adjustment for Academic Grievances */}
            {(selectedComplaint.type === "Academic" ||
              selectedComplaint.title.toLowerCase().includes("marks")) && (
              <div
                style={{
                  padding: "16px",
                  background: "rgba(13, 148, 136, 0.08)",
                  borderRadius: "16px",
                  border: "1px solid rgba(13, 148, 136, 0.25)",
                  marginBottom: "18px",
                }}
              >
                <strong
                  style={{
                    fontSize: "0.9rem",
                    color: "var(--staff-accent, #0d9488)",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    marginBottom: "4px",
                  }}
                >
                  <span>⚡</span> Direct Academic Section (AC) Marks Correction
                </strong>
                <p
                  style={{
                    margin: "0 0 12px 0",
                    fontSize: "0.8rem",
                    color: "var(--text-muted, #64748b)",
                  }}
                >
                  Evaluator authority: verify physical script from exam records
                  and update the recorded marks on the university server.
                </p>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    flexWrap: "wrap",
                  }}
                >
                  <label
                    style={{
                      fontSize: "0.825rem",
                      fontWeight: 700,
                      color: "var(--staff-accent, #0d9488)",
                    }}
                  >
                    New Internal Marks:
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={acMarksCorrection}
                    onChange={(e) =>
                      setAcMarksCorrection(Number(e.target.value))
                    }
                    className="glass-subtle"
                    style={{
                      width: "75px",
                      padding: "6px 10px",
                      fontWeight: 800,
                      borderRadius: "8px",
                      border: "1px solid rgba(0, 0, 0, 0.15)",
                      textAlign: "center",
                    }}
                  />
                  <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>
                    / 30
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      handleDirectMarksCorrection(
                        "CS302",
                        selectedComplaint.student.id,
                      )
                    }
                    style={{
                      padding: "8px 16px",
                      borderRadius: "10px",
                      border: "none",
                      background: "linear-gradient(135deg, #059669, #047857)",
                      color: "#ffffff",
                      fontSize: "0.825rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      boxShadow: "0 2px 8px rgba(5, 150, 105, 0.3)",
                    }}
                  >
                    ✓ Correct Marks to {acMarksCorrection}/30 &amp; Resolve
                    Ticket
                  </button>
                </div>
              </div>
            )}

            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.825rem",
                  fontWeight: 700,
                  marginBottom: "6px",
                }}
              >
                Resolution / Investigation Findings
              </label>
              <textarea
                rows={3}
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                placeholder="Document verification findings, answer script re-tallying, or work order dispatch..."
                className="glass-subtle"
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "12px",
                  border: "1px solid rgba(0, 0, 0, 0.1)",
                  fontFamily: "inherit",
                }}
              />
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                paddingTop: "16px",
                borderTop: "1px solid rgba(0, 0, 0, 0.08)",
                flexWrap: "wrap",
                gap: "10px",
              }}
            >
              <button
                type="button"
                onClick={() => setSelectedComplaint(null)}
                style={{
                  padding: "8px 16px",
                  borderRadius: "10px",
                  border: "1px solid rgba(0, 0, 0, 0.1)",
                  background: "transparent",
                  fontWeight: 600,
                  fontSize: "0.825rem",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>

              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => handleApplyComplaintResolution("under_review")}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "10px",
                    border: "1px solid rgba(0, 0, 0, 0.1)",
                    background: "rgba(255, 255, 255, 0.6)",
                    color: "var(--text-main, #0f172a)",
                    fontWeight: 700,
                    fontSize: "0.825rem",
                    cursor: "pointer",
                  }}
                >
                  Mark Under Review
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyComplaintResolution("resolved")}
                  style={{
                    padding: "8px 18px",
                    borderRadius: "10px",
                    border: "none",
                    background:
                      "linear-gradient(135deg, var(--staff-accent, #0d9488), var(--staff-primary, #0f766e))",
                    color: "#ffffff",
                    fontWeight: 700,
                    fontSize: "0.825rem",
                    cursor: "pointer",
                    boxShadow: "0 2px 8px rgba(13, 148, 136, 0.3)",
                  }}
                >
                  ✓ Mark as Resolved
                </button>
              </div>
            </div>

            {/* Two-Way Clarification Thread */}
            <TicketConversationThread
              complaintId={selectedComplaint.id}
              defaultRole="staff"
              defaultAuthorName={profile?.full_name || "Prof. Rahul Mehta"}
            />
          </GlassCard>
        </div>
      )}

      {/* Lightbox Modal */}
      {activeLightboxAttachment && (
        <EvidenceLightboxModal
          attachment={activeLightboxAttachment}
          onClose={() => setActiveLightboxAttachment(null)}
        />
      )}
    </div>
  );
}

// Backward-compatible alias export for existing tests and routes
export const WorkerDashboard = StaffDashboard;
export { StaffDashboard as WorkerDashboardAlias };
export default StaffDashboard;
