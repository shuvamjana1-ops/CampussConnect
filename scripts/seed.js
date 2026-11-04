/**
 * CampusConnect Supabase Database Seeder
 * Idempotently provisions demo users and realistic relational sample data.
 *
 * Demo Users:
 *  - Admin:    admin@demo.com    / Admin@123   (role: admin)
 *  - staff 1: faculty@demo.com  / staff@123  (role: staff)
 *  - staff 2: warden@demo.com  / staff@123  (role: staff)
 *  - Student 1: student1@demo.com / Student@123 (role: student)
 *  - Student 2: student2@demo.com / Student@123 (role: student)
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (
  !SUPABASE_URL ||
  !SERVICE_ROLE_KEY ||
  SUPABASE_URL.includes("your-project") ||
  SERVICE_ROLE_KEY.includes("your-service")
) {
  console.error("\n❌ Error: Missing or unconfigured Supabase credentials.");
  console.error(
    "Please configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.",
  );
  console.error("Example:");
  console.error("  SUPABASE_URL=https://xyzcompany.supabase.co");
  console.error("  SUPABASE_SERVICE_ROLE_KEY=eyJh...\n");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const DEMO_USERS = [
  {
    email: "admin@demo.com",
    password: "Admin@123",
    full_name: "Dr. Suresh Kumar",
    role: "admin",
    department: "University Administration & Governance",
  },
  {
    email: "faculty@demo.com",
    password: "staff@123",
    full_name: "Prof. Rahul Mehta",
    role: "staff",
    department: "Examination & Records Cell",
  },
  {
    email: "warden@demo.com",
    password: "staff@123",
    full_name: "Er. Dilip Roy",
    role: "staff",
    department: "Facilities & Infrastructure Services",
  },
  {
    email: "student1@demo.com",
    password: "Student@123",
    full_name: "Ananya Das",
    role: "student",
    department: "Computer Science & Engineering (Batch 2026)",
  },
  {
    email: "student2@demo.com",
    password: "Student@123",
    full_name: "Rohan Sharma",
    role: "student",
    department: "Electronics & Communication (Batch 2026)",
  },
];

async function seed() {
  console.log("🚀 Starting Idempotent Supabase Seeder...");
  console.log(`Connecting to: ${SUPABASE_URL}\n`);

  // 1. Fetch existing users to clean up old demo accounts
  const { data: existingData, error: listError } =
    await supabase.auth.admin.listUsers();
  if (listError) {
    console.error(
      "Failed to query users from Supabase Auth:",
      listError.message,
    );
    process.exit(1);
  }

  const existingUsers = existingData?.users || [];
  const demoEmails = new Set(DEMO_USERS.map((u) => u.email.toLowerCase()));

  for (const user of existingUsers) {
    if (user.email && demoEmails.has(user.email.toLowerCase())) {
      console.log(`🧹 Removing existing demo user: ${user.email} (${user.id})`);
      // Delete tasks and work items for this user
      await supabase.from("work_items").delete().eq("owner_id", user.id);
      await supabase.from("tasks").delete().eq("owner_id", user.id);
      await supabase.from("profiles").delete().eq("id", user.id);
      await supabase.auth.admin.deleteUser(user.id);
    }
  }

  console.log(
    "\n✨ Creating verified demo users in Supabase Auth & Profiles...",
  );
  const createdProfiles = new Map();

  for (const userSpec of DEMO_USERS) {
    const { data: authData, error: authErr } =
      await supabase.auth.admin.createUser({
        email: userSpec.email,
        password: userSpec.password,
        email_confirm: true,
        user_metadata: {
          full_name: userSpec.full_name,
        },
      });

    if (authErr) {
      console.error(
        `❌ Failed to create auth user ${userSpec.email}:`,
        authErr.message,
      );
      continue;
    }

    const userId = authData.user.id;

    // Trigger creates student profile; update with correct role & department
    const { error: profileErr } = await supabase.from("profiles").upsert({
      id: userId,
      email: userSpec.email,
      full_name: userSpec.full_name,
      role: userSpec.role,
      department: userSpec.department,
    });

    if (profileErr) {
      console.error(
        `❌ Failed to set profile for ${userSpec.email}:`,
        profileErr.message,
      );
    } else {
      console.log(
        `  ✓ [${userSpec.role.toUpperCase()}] ${userSpec.full_name} <${userSpec.email}> -> ID: ${userId}`,
      );
      createdProfiles.set(userSpec.email, { id: userId, ...userSpec });
    }
  }

  console.log("\n📦 Seeding realistic tasks and work items...");

  const student1 = createdProfiles.get("student1@demo.com");
  const student2 = createdProfiles.get("student2@demo.com");
  const worker1 = createdProfiles.get("faculty@demo.com");
  const worker2 = createdProfiles.get("warden@demo.com");
  const admin = createdProfiles.get("admin@demo.com");

  if (student1) {
    const { data: t1 } = await supabase
      .from("tasks")
      .insert({
        owner_id: student1.id,
        title: "Internal Assessment Marks Discrepancy in CS302",
        description:
          "Mid-term evaluation was recorded as 12/30 instead of 22/30 in the university grade book. Exam hall ticket generation window ends this Friday.",
        category: "Examination",
        priority: "high",
        status: "in_progress",
        assigned_worker_id: worker1?.id,
        resolution_notes:
          "Retrieved exam script from archives; re-tallying underway with evaluator.",
      })
      .select()
      .single();

    if (t1) {
      await supabase.from("work_items").insert({
        owner_id: student1.id,
        task_id: t1.id,
        title: "Mid-Term Exam Script Photocopy",
        details:
          "High-resolution scan of evaluated answer sheet pages 1 to 4 with evaluator initial.",
        status: "submitted",
      });
    }

    await supabase.from("tasks").insert({
      owner_id: student1.id,
      title: "Mandakini Hostel Block B Wi-Fi Router Downtime",
      description:
        "Access point AP-304 on 3rd floor corridor has been unreachable since 08:00 AM.",
      category: "Infrastructure",
      priority: "urgent",
      status: "pending",
    });
  }

  if (student2) {
    const { data: t2 } = await supabase
      .from("tasks")
      .insert({
        owner_id: student2.id,
        title: "NPTEL Credit Transfer Verification Request",
        description:
          "Submitted 12-week NPTEL course in Embedded Systems for 3 academic credit points.",
        category: "Academic",
        priority: "low",
        status: "in_progress",
      })
      .select()
      .single();

    if (t2) {
      await supabase.from("work_items").insert({
        owner_id: student2.id,
        task_id: t2.id,
        title: "NPTEL Elite Gold Certificate",
        details:
          "Final score 88% with top 1% candidate percentile accreditation certificate.",
        status: "approved",
      });
    }

    await supabase.from("tasks").insert({
      owner_id: student2.id,
      title: "Central Library Book Hold Clearance for Hall Ticket",
      description:
        "Reference book returned on Oct 28th still shows active hold on student account.",
      category: "Library",
      priority: "medium",
      status: "completed",
      resolution_notes:
        "Circulation desk verified physical copy return. Clearance approved.",
    });
  }

  if (worker1) {
    const { data: tw1 } = await supabase
      .from("tasks")
      .insert({
        owner_id: worker1.id,
        title: "CS302 Answer Script Batch Audit & Moderation",
        description:
          "Audit 65 student answer scripts and cross-reference with marks entry portal.",
        category: "Examination",
        priority: "urgent",
        status: "in_progress",
      })
      .select()
      .single();

    if (tw1) {
      await supabase.from("work_items").insert({
        owner_id: worker1.id,
        task_id: tw1.id,
        title: "CS302 Moderation Worksheet",
        details:
          "Tabulated marks comparison sheet with signed dean authorization.",
        status: "reviewed",
      });
    }
  }

  if (worker2) {
    const { data: tw2 } = await supabase
      .from("tasks")
      .insert({
        owner_id: worker2.id,
        title: "Campus Electrical Substation Maintenance Inspection",
        description:
          "Perform scheduled load testing on backup diesel generators and circuit breakers.",
        category: "Infrastructure",
        priority: "high",
        status: "pending",
      })
      .select()
      .single();

    if (tw2) {
      await supabase.from("work_items").insert({
        owner_id: worker2.id,
        task_id: tw2.id,
        title: "Generator Maintenance Checklist Form",
        details:
          "Fuel levels, battery voltage, coolant pressure, and phase output logs.",
        status: "submitted",
      });
    }
  }

  if (admin) {
    await supabase.from("tasks").insert({
      owner_id: admin.id,
      title: "Institutional Accreditation & NAAC Review Dossier",
      description:
        "Consolidate faculty research publications and grievance redressal metrics for annual audit.",
      category: "Governance",
      priority: "high",
      status: "in_progress",
    });
  }

  console.log("\n🎉 Seed process completed successfully!");
  console.log("----------------------------------------------------");
  console.log("DEMO ACCOUNTS READY:");
  console.log("  Admin:     admin@demo.com    | Admin@123");
  console.log("  staff 1:  faculty@demo.com  | staff@123");
  console.log("  staff 2:  warden@demo.com  | staff@123");
  console.log("  Student 1: student1@demo.com | Student@123");
  console.log("  Student 2: student2@demo.com | Student@123");
  console.log("----------------------------------------------------\n");
}

seed().catch((err) => {
  console.error("Fatal seed error:", err);
  process.exit(1);
});
