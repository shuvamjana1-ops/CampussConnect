import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AcademicSectionView } from "../components/AcademicSectionView";
import AdminDashboard from "../routes/(admin)/AdminDashboard";
import WorkerDashboard from "../routes/(staff)/WorkerDashboard";
import StudentDashboard from "../routes/(student)/StudentDashboard";
import { complaintStore } from "../services/complaintStore";
import { SessionProvider } from "../auth/session";
import { I18nProvider } from "../i18n/I18nProvider";

function renderWithProviders(ui: React.ReactElement): string {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderToString(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <I18nProvider>
          <MemoryRouter>{ui}</MemoryRouter>
        </I18nProvider>
      </SessionProvider>
    </QueryClientProvider>,
  );
}

describe("Student AC Complaint Registration & Admin/staff Workflows", () => {
  it("allows registering a complaint for an AC subject marks discrepancy and updates the reactive store", () => {
    const initialComplaints = complaintStore.getComplaints();
    const countBefore = initialComplaints.length;

    const registered = complaintStore.addComplaint({
      type: "Academic",
      title: "Discrepancy in CS302 Internal Marks: 12/30 vs 22/30 on script",
      description:
        "Mid-term evaluation was recorded as 12/30 instead of 22/30.",
      department: "Examination & Records Cell",
      priority: "Urgent (P0)",
      currentStage: "submitted",
      student: {
        id: "usr_ananya_01",
        name: "Ananya Das",
        rollNumber: "JISU/2024/CSE/0842",
        department: "Computer Science & Engineering",
        semester: "4th",
        cgpa: "8.92",
        academicStatus: "Good Standing",
      },
      expectedResolutionTime: "Within 24 hours",
    });

    expect(registered.reference).toMatch(/^REQ-2026-\d{4}$/);
    expect(complaintStore.getComplaints().length).toBe(countBefore + 1);

    // Complaint is retrievable by ID
    const found = complaintStore.getComplaint(registered.id);
    expect(found).toBeDefined();
    expect(found?.title).toContain("CS302");
  });

  it("renders student AC section with Discrepancy flagging and AC grievance action", () => {
    const html = renderWithProviders(<AcademicSectionView />);
    expect(html).toContain(
      "OFFICIAL ACADEMIC SECTION (AC) RECORD · JIS UNIVERSITY",
    );
    expect(html).toContain("Register AC Marks Grievance");
    expect(html).toContain("Flag Discrepancy");
    expect(html).toContain("CS302");
  });

  it("renders student dashboard with live grievance progression tracking", () => {
    const html = renderWithProviders(<StudentDashboard />);
    expect(html).toContain("STUDENT IDENTITY PORTAL · JIS UNIVERSITY");
    expect(html).toContain("My Grievances &amp; Progress");
    expect(html).toContain("Lodge New Ticket");
    expect(html).toContain("CS302");
  });

  it("renders staff dashboard displaying student AC grievances in staff queue", () => {
    const html = renderWithProviders(<WorkerDashboard />);
    expect(html).toContain("STAFF RESOLUTION WORKSPACE · JIS UNIVERSITY");
    expect(html).toContain("Assigned Student Grievances");
    expect(html).toContain("Work on This Case");
  });

  it("renders admin command center with Student Grievances & AC cases table", () => {
    const html = renderWithProviders(<AdminDashboard />);
    expect(html).toContain("SUPER-USER COMMAND CENTER · JIS UNIVERSITY");
    expect(html).toContain("Student Grievances &amp; Academic AC Cases");
    expect(html).toContain("Work on Case");
  });

  it("allows staff or admin to update marks and resolve the complaint end-to-end", () => {
    // 1. Check initial record
    const recordBefore = complaintStore.getACRecord("usr_ananya_01");
    expect(recordBefore).toBeDefined();

    // 2. staff / Admin corrects marks to 22
    complaintStore.updateACMarks("usr_ananya_01", "CS302", 22);

    // 3. Status is updated to resolved
    const complaints = complaintStore.getComplaints();
    const acComplaint = complaints.find((c) => c.title.includes("CS302"));
    if (acComplaint) {
      complaintStore.updateStatus(
        acComplaint.id,
        "resolved",
        "Physical script re-verified by Prof. Rahul Mehta. Internal marks updated to 22/30.",
        "Prof. Rahul Mehta (Course Evaluator)",
      );

      const resolvedComplaint = complaintStore.getComplaint(acComplaint.id);
      expect(resolvedComplaint?.currentStage).toBe("resolved");
      expect(
        resolvedComplaint?.timeline[resolvedComplaint.timeline.length - 1]
          ?.description,
      ).toContain("22/30");
    }

    // 4. Academic record reflects the updated marks and verified status
    const recordAfter = complaintStore.getACRecord("usr_ananya_01");
    const cs302 = recordAfter?.subjects.find((s) => s.code === "CS302");
    expect(cs302?.internalMarks).toBe(22);
    expect(cs302?.status).toBe("Marks Discrepancy Resolved");
  });

  it("renders AC personal data dossier and allows users to edit personal data", () => {
    const html = renderWithProviders(<AcademicSectionView />);
    expect(html).toContain("ACADEMIC IDENTITY &amp; STUDENT DOSSIER");
    expect(html).toContain("Personal Details &amp; Contact Information");
    expect(html).toContain("Edit AC Personal Data");
    expect(html).toContain("Phone Contact");
    expect(html).toContain("Registered Email");
    expect(html).toContain("Parent / Guardian");
    expect(html).toContain("Emergency Number");
    expect(html).toContain("Blood Group");

    // Test updating AC personal data via store
    const updated = complaintStore.updateACPersonalData("usr_ananya_01", {
      phone: "+91-98309-99999",
      guardianName: "Dr. S. Das (Senior Scientist)",
      bloodGroup: "O+ (Positive)",
      emergencyContact: "+91-98300-88888",
    });

    expect(updated).not.toBeNull();
    expect(updated?.phone).toBe("+91-98309-99999");
    expect(updated?.guardianName).toBe("Dr. S. Das (Senior Scientist)");
    expect(updated?.emergencyContact).toBe("+91-98300-88888");

    // Verify record query returns updated personal data
    const queried = complaintStore.getACRecord("usr_ananya_01");
    expect(queried?.phone).toBe("+91-98309-99999");
    expect(queried?.guardianName).toBe("Dr. S. Das (Senior Scientist)");
  });
});
