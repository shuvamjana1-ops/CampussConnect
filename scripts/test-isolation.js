/**
 * CampusConnect RLS Isolation Test Suite
 * Validates Postgres Row-Level Security (RLS) policies using the Supabase ANON KEY.
 *
 * Verifies:
 *  1. student1 selecting student2's profile/work returns empty or error.
 *  2. student1 cannot update student2's rows.
 *  3. worker1 cannot read student data or worker2's data.
 *  4. Nobody except admin can change a role.
 *  5. Admin can read all profiles, tasks, and work items.
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (
  !SUPABASE_URL ||
  !ANON_KEY ||
  SUPABASE_URL.includes("your-project") ||
  ANON_KEY.includes("your-anon")
) {
  console.error("\n❌ Error: Missing or unconfigured Supabase credentials.");
  console.error(
    "Please configure SUPABASE_URL and SUPABASE_ANON_KEY in your .env file to run isolation tests.\n",
  );
  process.exit(1);
}

function makeClient() {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

const results = [];

function recordResult(name, passed, details = "") {
  results.push({ name, passed, details });
  const status = passed ? "\x1b[32m[PASS]\x1b[0m" : "\x1b[31m[FAIL]\x1b[0m";
  console.log(`  ${status} ${name} ${details ? `(${details})` : ""}`);
}

async function runIsolationTests() {
  console.log("\n🔒 Starting Supabase RLS Isolation Verification...\n");

  // --- STUDENT 1 AUTHENTICATION ---
  const student1Client = makeClient();
  const { data: s1Auth, error: s1AuthErr } =
    await student1Client.auth.signInWithPassword({
      email: "student1@demo.com",
      password: "Student@123",
    });

  if (s1AuthErr || !s1Auth?.user) {
    console.error(
      '❌ Could not log in as student1@demo.com. Did you run "npm run seed" first?',
    );
    process.exit(1);
  }

  const student1Id = s1Auth.user.id;
  console.log(
    `Authenticated as Student 1: ${s1Auth.user.email} (${student1Id})`,
  );

  // Check 1: Student 1 can select own profile
  const { data: s1Profile } = await student1Client
    .from("profiles")
    .select()
    .eq("id", student1Id)
    .single();
  recordResult(
    "Student 1 can read own profile",
    Boolean(s1Profile && s1Profile.email === "student1@demo.com"),
  );

  // Check 2: Student 1 cannot read Student 2's profile
  const { data: s2ProfileQuery } = await student1Client
    .from("profiles")
    .select()
    .eq("email", "student2@demo.com");
  recordResult(
    "Student 1 selecting Student 2 profile returns empty",
    !s2ProfileQuery || s2ProfileQuery.length === 0,
    `Returned ${s2ProfileQuery ? s2ProfileQuery.length : 0} rows`,
  );

  // Check 3: Student 1 cannot read other users tasks / work items
  const { data: s1TasksQuery } = await student1Client.from("tasks").select();
  const foreignTasks = (s1TasksQuery || []).filter(
    (t) => t.owner_id !== student1Id,
  );
  recordResult(
    "Student 1 query for tasks returns ONLY own tasks",
    foreignTasks.length === 0 && (s1TasksQuery?.length || 0) > 0,
    `Found ${foreignTasks.length} foreign tasks`,
  );

  // Check 4: Student 1 cannot update other users data
  const { data: updateForeignData, error: updateForeignErr } =
    await student1Client
      .from("profiles")
      .update({ full_name: "Hacked by Student 1" })
      .neq("id", student1Id)
      .select();

  recordResult(
    "Student 1 cannot update foreign profiles",
    !updateForeignData ||
      updateForeignData.length === 0 ||
      Boolean(updateForeignErr),
    `Updated ${updateForeignData?.length || 0} rows`,
  );

  // Check 5: Student 1 cannot escalate their own role to 'admin'
  const { data: roleEscalateData, error: roleEscalateErr } =
    await student1Client
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", student1Id)
      .select();

  // Verification: either query errors out or profile remains 'student'
  const { data: verifyRole } = await student1Client
    .from("profiles")
    .select("role")
    .eq("id", student1Id)
    .single();
  const roleBlocked =
    Boolean(roleEscalateErr) || (verifyRole && verifyRole.role === "student");
  recordResult(
    "Student 1 privilege escalation blocked (cannot change role to admin)",
    roleBlocked,
    `Current role: ${verifyRole?.role}`,
  );

  // --- staff 1 AUTHENTICATION ---
  console.log("\nAuthenticating as staff 1: faculty@demo.com...");
  const worker1Client = makeClient();
  const { data: w1Auth, error: w1AuthErr } =
    await worker1Client.auth.signInWithPassword({
      email: "faculty@demo.com",
      password: "staff@123",
    });

  if (w1AuthErr || !w1Auth?.user) {
    console.error("❌ Could not log in as faculty@demo.com");
    process.exit(1);
  }

  const worker1Id = w1Auth.user.id;

  // Check 6: staff 1 cannot read Student 1's tasks
  const { data: w1StudentTaskQuery } = await worker1Client
    .from("tasks")
    .select()
    .eq("owner_id", student1Id);
  recordResult(
    "staff 1 cannot read Student 1 tasks",
    !w1StudentTaskQuery || w1StudentTaskQuery.length === 0,
    `Returned ${w1StudentTaskQuery ? w1StudentTaskQuery.length : 0} rows`,
  );

  // Check 7: staff 1 cannot read staff 2's tasks
  const { data: w1AllTasks } = await worker1Client.from("tasks").select();
  const foreignWorkerTasks = (w1AllTasks || []).filter(
    (t) => t.owner_id !== worker1Id,
  );
  recordResult(
    "staff 1 cannot read staff 2 tasks",
    foreignWorkerTasks.length === 0,
    `Found ${foreignWorkerTasks.length} foreign staff tasks`,
  );

  // Check 8: staff 1 cannot escalate role
  const { error: w1RoleErr } = await worker1Client
    .from("profiles")
    .update({ role: "admin" })
    .eq("id", worker1Id);
  const { data: verifyWorkerRole } = await worker1Client
    .from("profiles")
    .select("role")
    .eq("id", worker1Id)
    .single();
  recordResult(
    "staff 1 privilege escalation blocked (cannot change role to admin)",
    Boolean(w1RoleErr) || verifyWorkerRole?.role === "staff",
    `Current role: ${verifyWorkerRole?.role}`,
  );

  // --- ADMIN AUTHENTICATION ---
  console.log("\nAuthenticating as Admin: admin@demo.com...");
  const adminClient = makeClient();
  const { data: adminAuth, error: adminAuthErr } =
    await adminClient.auth.signInWithPassword({
      email: "admin@demo.com",
      password: "Admin@123",
    });

  if (adminAuthErr || !adminAuth?.user) {
    console.error("❌ Could not log in as admin@demo.com");
    process.exit(1);
  }

  // Check 9: Admin can read ALL profiles
  const { data: allProfiles } = await adminClient.from("profiles").select();
  recordResult(
    "Admin can read ALL profiles",
    Boolean(allProfiles && allProfiles.length >= 5),
    `Total profiles visible: ${allProfiles?.length || 0}`,
  );

  // Check 10: Admin can read tasks across all roles
  const { data: allTasks } = await adminClient.from("tasks").select();
  const uniqueOwners = new Set((allTasks || []).map((t) => t.owner_id));
  recordResult(
    "Admin can read all tasks across students and workers",
    Boolean(allTasks && allTasks.length > 0 && uniqueOwners.size > 1),
    `Total tasks visible: ${allTasks?.length || 0} across ${uniqueOwners.size} owners`,
  );

  console.log("\n====================================================");
  const allPassed = results.every((r) => r.passed);
  if (allPassed) {
    console.log("🎉 ALL RLS ISOLATION TESTS PASSED (10/10)!");
    console.log("Database is strictly secure by default.");
  } else {
    console.log("❌ SOME RLS ISOLATION TESTS FAILED");
    process.exit(1);
  }
  console.log("====================================================\n");
}

runIsolationTests().catch((err) => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
