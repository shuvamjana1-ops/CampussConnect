import React, { useEffect, useState } from "react";
import { Send, MessageSquare, Shield, User, Wrench } from "lucide-react";
import { GlassCard } from "./GlassCard";
import { complaintStore, type ComplaintData } from "../services/complaintStore";

export interface TicketConversationThreadProps {
  readonly complaintId: string;
  readonly defaultRole?: "student" | "staff" | "admin";
  readonly defaultAuthorName?: string;
}

export function TicketConversationThread({
  complaintId,
  defaultRole = "student",
  defaultAuthorName,
}: TicketConversationThreadProps) {
  const [complaint, setComplaint] = useState<ComplaintData | undefined>(() =>
    complaintStore.getComplaint(complaintId),
  );
  const [replyText, setReplyText] = useState("");
  const [activeRole, setActiveRole] = useState<"student" | "staff" | "admin">(
    defaultRole,
  );

  useEffect(() => {
    const unsub = complaintStore.subscribe(() => {
      setComplaint(complaintStore.getComplaint(complaintId));
    });
    setComplaint(complaintStore.getComplaint(complaintId));
    return unsub;
  }, [complaintId]);

  const comments = complaint?.comments || [];

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) return;

    const authorName =
      defaultAuthorName ||
      (activeRole === "admin"
        ? "Super Admin Office"
        : activeRole === "staff"
          ? complaint?.assignedStaffName || "Faculty Evaluator"
          : complaint?.student.name || "Student");

    complaintStore.addComplaintComment(complaintId, {
      authorName,
      authorRole: activeRole,
      message: replyText.trim(),
    });

    setReplyText("");
  };

  const getRoleBadge = (role: "student" | "staff" | "admin") => {
    switch (role) {
      case "student":
        return {
          label: "Student",
          icon: <User size={12} />,
          bg: "rgba(37, 99, 235, 0.15)",
          color: "#60a5fa",
          border: "rgba(37, 99, 235, 0.35)",
        };
      case "staff":
        return {
          label: "Faculty Evaluator / Staff",
          icon: <Wrench size={12} />,
          bg: "rgba(13, 148, 136, 0.15)",
          color: "#2dd4bf",
          border: "rgba(13, 148, 136, 0.35)",
        };
      case "admin":
        return {
          label: "Admin Oversight",
          icon: <Shield size={12} />,
          bg: "rgba(99, 102, 241, 0.15)",
          color: "#a5b4fc",
          border: "rgba(99, 102, 241, 0.35)",
        };
    }
  };

  return (
    <div
      style={{
        marginTop: "1.25rem",
        padding: "16px",
        borderRadius: "16px",
        background: "rgba(15, 23, 42, 0.6)",
        border: "1px solid rgba(255, 255, 255, 0.12)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "14px",
          paddingBottom: "10px",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <MessageSquare size={16} style={{ color: "#60a5fa" }} />
          <strong style={{ fontSize: "0.9rem", color: "#f8fafc" }}>
            Two-Way Case Clarification Thread ({comments.length})
          </strong>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "0.725rem", color: "#94a3b8" }}>
            Post as:
          </span>
          <select
            value={activeRole}
            onChange={(e) => setActiveRole(e.target.value as any)}
            style={{
              padding: "3px 8px",
              fontSize: "0.75rem",
              borderRadius: "8px",
              cursor: "pointer",
            }}
          >
            <option value="student">Student</option>
            <option value="staff">Faculty / Staff</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>

      {/* Messages List */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          maxHeight: "300px",
          overflowY: "auto",
          paddingRight: "6px",
          marginBottom: "14px",
        }}
      >
        {comments.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "20px",
              color: "#94a3b8",
              fontSize: "0.85rem",
            }}
          >
            No clarification messages exchanged yet. Use the field below to
            submit evidence notes or ask questions.
          </div>
        ) : (
          comments.map((cmt) => {
            const badge = getRoleBadge(cmt.authorRole);
            return (
              <GlassCard
                key={cmt.id}
                material="glass-subtle"
                style={{
                  padding: "12px 16px",
                  borderRadius: "12px",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  background:
                    cmt.authorRole === "student"
                      ? "rgba(30, 41, 59, 0.7)"
                      : cmt.authorRole === "admin"
                        ? "rgba(49, 46, 129, 0.3)"
                        : "rgba(19, 78, 74, 0.3)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "6px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <strong style={{ fontSize: "0.85rem", color: "#f8fafc" }}>
                      {cmt.authorName}
                    </strong>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "2px 8px",
                        borderRadius: "9999px",
                        background: badge.bg,
                        color: badge.color,
                        border: `1px solid ${badge.border}`,
                        fontSize: "0.7rem",
                        fontWeight: 700,
                      }}
                    >
                      {badge.icon}
                      <span>{badge.label}</span>
                    </span>
                  </div>
                  <time style={{ fontSize: "0.725rem", color: "#94a3b8" }}>
                    {cmt.timestamp}
                  </time>
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.85rem",
                    color: "#e2e8f0",
                    lineHeight: 1.45,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {cmt.message}
                </p>
              </GlassCard>
            );
          })
        )}
      </div>

      {/* Reply Input Form */}
      <form onSubmit={handleSend} style={{ display: "flex", gap: "8px" }}>
        <input
          type="text"
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          placeholder={`Write clarification or instruction as ${activeRole}...`}
          style={{
            flex: 1,
            padding: "10px 14px",
            borderRadius: "10px",
            background: "rgba(20, 20, 32, 0.85)",
            border: "1px solid rgba(255, 255, 255, 0.16)",
            color: "#f8fafc",
            fontSize: "0.85rem",
            outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={!replyText.trim()}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "10px 18px",
            borderRadius: "10px",
            background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
            color: "#ffffff",
            border: "none",
            fontWeight: 700,
            fontSize: "0.825rem",
            cursor: replyText.trim() ? "pointer" : "not-allowed",
            opacity: replyText.trim() ? 1 : 0.5,
          }}
        >
          <Send size={14} />
          <span>Reply</span>
        </button>
      </form>
    </div>
  );
}

export default TicketConversationThread;
