import { chromium, expect } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
const accountsPath = existsSync("backend/.local/accounts.json")
  ? "backend/.local/accounts.json"
  : "../backend/.local/accounts.json";
const manifest = JSON.parse(readFileSync(accountsPath, "utf8"));
const { accounts, ids } = manifest;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const contexts = [],
  checks = [],
  errors = [];
const base = "http://127.0.0.1:5173";
const suffix = Date.now().toString().slice(-8);
async function check(name, fn) {
  await fn();
  checks.push(name);
  console.log("PASS", name);
}
async function login(role, width = 1440) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
  });
  contexts.push(context);
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/workspace");
  await page
    .getByLabel("Email address", { exact: true })
    .fill(accounts[role].email);
  // Generated secrets are consumed only locally and never printed.
  await page
    .getByLabel("Password", { exact: true })
    .fill(accounts[role].password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("navigation", { name: "School workspace" }).waitFor();
  return page;
}
const mainNav = (p, name) =>
  p
    .getByRole("navigation", { name: "School workspace" })
    .getByRole("link", { name, exact: true });
const classNav = (p, tab) =>
  p.locator(".live-tabs").getByRole("button", { name: tab, exact: true });
try {
  const admin = await login("admin");
  await check("Real login opens persisted school classes", () =>
    expect(
      admin.getByRole("heading", { name: "Class portals", exact: true }),
    ).toBeVisible(),
  );
  await admin.getByText("Create a class portal", { exact: true }).click();
  await admin.getByLabel("Grade", { exact: true }).fill("9");
  await admin
    .getByLabel("Section", { exact: true })
    .fill("B" + suffix.slice(-4));
  await admin.getByLabel("Academic year", { exact: true }).fill("2026-27");
  await admin
    .getByRole("button", { name: "Create class", exact: true })
    .click();
  const newCard = admin
    .locator(".live-grid .card")
    .filter({
      has: admin.getByRole("heading", {
        name: "Class 9-B" + suffix.slice(-4),
        exact: true,
      }),
    });
  await expect(newCard).toBeVisible();
  await newCard.getByRole("link", { name: "Open class", exact: true }).click();
  const newClassId = new URL(admin.url()).pathname.split("/").at(-1);
  await classNav(admin, "Class settings").click();
  await admin
    .getByLabel("Portal status", { exact: true })
    .selectOption("active");
  await admin
    .getByRole("button", { name: "Save portal settings", exact: true })
    .click();
  await expect(admin.getByLabel("Portal status", { exact: true })).toHaveValue(
    "active",
  );
  const teacherRow = admin
    .locator(".live-line")
    .filter({ has: admin.getByText("Local Teacher A", { exact: true }) });
  await teacherRow
    .getByRole("button", { name: "Assign teacher", exact: true })
    .click();
  await check("Admin creates, activates and assigns a database class", () =>
    expect(
      teacherRow.getByRole("button", {
        name: "Revoke assignment",
        exact: true,
      }),
    ).toBeVisible(),
  );

  const teacher = await login("teacher_a", 1280);
  await teacher.goto(base + "/workspace/classes/" + newClassId);
  await teacher.getByText("Add a student", { exact: true }).click();
  await teacher
    .getByLabel("Student name", { exact: true })
    .fill("Browser Student " + suffix);
  await teacher
    .getByLabel("Admission number", { exact: true })
    .fill("B-" + suffix);
  await teacher.getByLabel("Roll number", { exact: true }).fill("1");
  await teacher
    .getByRole("button", { name: "Add student", exact: true })
    .click();
  await check("Assigned teacher adds a student to PostgreSQL", () =>
    expect(
      teacher.getByRole("cell", {
        name: "Browser Student " + suffix,
        exact: true,
      }),
    ).toBeVisible(),
  );
  await teacher.goto(base + "/workspace/classes/" + ids.class_b);
  await check("Direct unassigned class URL is denied", () =>
    expect(teacher.getByRole("alert")).toContainText("Resource unavailable"),
  );

  await teacher.goto(base + "/workspace/classes/" + ids.class_a);
  await classNav(teacher, "Exams").click();
  await teacher.getByText("Create an assessment", { exact: true }).click();
  await teacher
    .getByLabel("Exam name", { exact: true })
    .fill("Browser Assessment " + suffix);
  await teacher
    .getByLabel("Subjects · one per line, e.g. Mathematics:100", {
      exact: true,
    })
    .fill("Mathematics:100\nEnglish:50");
  await teacher
    .getByRole("button", { name: "Create exam", exact: true })
    .click();
  const examCard = teacher
    .locator(".live-grid .card")
    .filter({
      has: teacher.getByRole("heading", {
        name: "Browser Assessment " + suffix,
        exact: true,
      }),
    });
  await examCard.getByRole("link", { name: "Open marks", exact: true }).click();
  await teacher
    .getByLabel("Ahmed · Fictional Mathematics", { exact: true })
    .fill("87");
  await teacher
    .getByLabel("Ahmed · Fictional English", { exact: true })
    .fill("43");
  await teacher
    .getByLabel("Bilal · Fictional Mathematics", { exact: true })
    .fill("70");
  await teacher
    .getByLabel("Bilal · Fictional English", { exact: true })
    .fill("35");
  await teacher
    .getByRole("button", { name: "Save marks", exact: true })
    .click();
  await expect(
    teacher.getByText("Marks saved.", { exact: true }),
  ).toBeVisible();
  await teacher
    .getByRole("button", { name: "Publish reports", exact: true })
    .click();
  await check("Teacher saves marks and publishes immutable reports", () =>
    expect(
      teacher.getByRole("heading", {
        name: "Reports are published",
        exact: true,
      }),
    ).toBeVisible(),
  );

  await teacher.goto(base + "/workspace/classes/" + ids.class_a);
  await classNav(teacher, "Attendance").click();
  await teacher
    .getByLabel("Attendance for Ahmed · Fictional", { exact: true })
    .selectOption("present");
  await teacher
    .getByLabel("Attendance for Bilal · Fictional", { exact: true })
    .selectOption("absent");
  await teacher
    .getByRole("button", { name: "Save attendance", exact: true })
    .click();
  await check("Teacher attendance is saved", () =>
    expect(
      teacher.getByText("Attendance saved.", { exact: true }),
    ).toBeVisible(),
  );

  await classNav(teacher, "Homework").click();
  await teacher.getByLabel("Subject", { exact: true }).fill("English");
  await teacher
    .getByLabel("Task title", { exact: true })
    .fill("Reading practice " + suffix);
  await teacher
    .getByLabel("Instructions", { exact: true })
    .fill("Fictional local homework. Read chapter two.");
  await teacher
    .getByRole("button", { name: "Publish homework", exact: true })
    .click();
  await expect(teacher.getByRole("status")).toContainText(
    "Saved to your school workspace.",
  );

  await mainNav(teacher, "Notices").click();
  await teacher.getByText("Write a notice", { exact: true }).click();
  await teacher.getByLabel("Audience", { exact: true }).selectOption("student");
  await teacher.getByLabel("Class", { exact: true }).selectOption(ids.class_a);
  await teacher
    .getByLabel("Student", { exact: true })
    .selectOption(ids.enrollment_a);
  await teacher.getByLabel("Category", { exact: true }).selectOption("Uniform");
  await teacher
    .getByLabel("Notice title", { exact: true })
    .fill("Private uniform reminder " + suffix);
  await teacher
    .getByLabel("Notice details", { exact: true })
    .fill("Fictional local note for Ahmed's guardian only.");
  await teacher
    .getByRole("button", { name: "Publish notice", exact: true })
    .click();
  await check("Teacher publishes a private student notice", () =>
    expect(
      teacher.getByRole("heading", {
        name: "Private uniform reminder " + suffix,
        exact: true,
      }),
    ).toBeVisible(),
  );

  const parent = await login("parent_a", 390);
  await check("Parent sees only linked children", async () => {
    await expect(
      parent.getByRole("heading", { name: "Your children", exact: true }),
    ).toBeVisible();
    await expect(parent.locator(".live-child-picker button")).toHaveCount(2);
    await expect(parent.locator(".live-child-picker")).not.toContainText(
      "Bilal",
    );
  });
  await check("Saved attendance reaches the linked parent", () =>
    expect(
      parent.getByRole("cell", { name: "present", exact: true }),
    ).toBeVisible(),
  );
  await mainNav(parent, "Reports").click();
  await expect(parent.locator(".live-content")).not.toContainText("Bilal");
  await parent
    .locator(".live-grid .card")
    .filter({
      has: parent.getByText("Browser Assessment " + suffix, { exact: true }),
    })
    .getByRole("link", { name: "Read report", exact: true })
    .click();
  await check("Published marks reach the private parent report", async () => {
    await expect(
      parent.getByRole("heading", { name: "Ahmed · Fictional", exact: true }),
    ).toBeVisible();
    await expect(
      parent.getByRole("cell", { name: "87", exact: true }),
    ).toBeVisible();
  });
  mkdirSync("verification", { recursive: true });
  await parent.screenshot({
    path: "verification/backend-parent-report-mobile.png",
    fullPage: true,
  });
  await parent.goto(base + "/workspace/reports/" + ids.report_other);
  await check("Changing report ID cannot reveal another child", () =>
    expect(parent.getByRole("alert")).toContainText("Resource unavailable"),
  );

  await mainNav(parent, "Notices").click();
  await expect(
    parent.getByRole("heading", {
      name: "Private uniform reminder " + suffix,
      exact: true,
    }),
  ).toBeVisible();
  await parent
    .getByRole("button", { name: "Acknowledge notice", exact: true })
    .click();
  await check("Parent notice acknowledgement is persisted", () =>
    expect(parent.getByText("Acknowledged", { exact: true })).toBeVisible(),
  );
  const parentB = await login("parent_b", 390);
  await mainNav(parentB, "Notices").click();
  await check("Private student notice is hidden from another parent", () =>
    expect(
      parentB.getByRole("heading", {
        name: "Private uniform reminder " + suffix,
        exact: true,
      }),
    ).toHaveCount(0),
  );

  await mainNav(parent, "Homework & leave").click();
  await parent
    .getByRole("button", {
      name: "Mark checked for Ahmed · Fictional",
      exact: true,
    })
    .first()
    .click();
  await check("Parent can mark their child's homework checked", () =>
    expect(
      parent
        .getByText("Checked for Ahmed · Fictional", { exact: true })
        .first(),
    ).toBeVisible(),
  );
  await parent.getByText("Request leave", { exact: true }).click();
  await parent
    .getByLabel("Child", { exact: true })
    .selectOption(ids.enrollment_a);
  const leaveDay =
    "2027-" +
    String(Math.floor(Math.random() * 12) + 1).padStart(2, "0") +
    "-" +
    String(Math.floor(Math.random() * 25) + 1).padStart(2, "0");
  await parent.getByLabel("From date", { exact: true }).fill(leaveDay);
  await parent.getByLabel("To date", { exact: true }).fill(leaveDay);
  await parent
    .getByLabel("Reason for leave", { exact: true })
    .fill("Fictional browser leave " + suffix);
  await parent
    .getByRole("button", { name: "Send leave request", exact: true })
    .click();
  await check("Parent leave request persists", () =>
    expect(
      parent.getByText("Fictional browser leave " + suffix, { exact: true }),
    ).toBeVisible(),
  );
  await mainNav(teacher, "Leave requests").click();
  const leaveCard = teacher
    .locator(".card")
    .filter({
      has: teacher.getByText("Fictional browser leave " + suffix, {
        exact: true,
      }),
    });
  await leaveCard
    .getByLabel("Decision", { exact: true })
    .selectOption("approved");
  await leaveCard
    .getByLabel("Response to parent", { exact: true })
    .fill("Approved · local browser verification");
  await leaveCard
    .getByRole("button", { name: "Save decision", exact: true })
    .click();
  await expect(leaveCard.getByText("approved", { exact: true })).toBeVisible();
  await parent.reload();
  const parentLeave = parent
    .locator(".card")
    .filter({
      has: parent.getByText("Fictional browser leave " + suffix, {
        exact: true,
      }),
    });
  await check("Teacher leave decision reaches parent", () =>
    expect(parentLeave.getByText("approved", { exact: true })).toBeVisible(),
  );

  for (const width of [390, 768, 1440]) {
    await parent.setViewportSize({ width, height: 900 });
    await check("Parent responsive layout at " + width, async () => {
      const overflow = await parent.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      );
      if (overflow) throw Error("Horizontal page overflow at " + width);
    });
  }
  await admin.goto(base + "/workspace/classes/" + newClassId);
  await classNav(admin, "Class settings").click();
  await admin
    .getByLabel("Portal status", { exact: true })
    .selectOption("inactive");
  await admin
    .getByRole("button", { name: "Save portal settings", exact: true })
    .click();
  await expect(admin.getByLabel("Portal status", { exact: true })).toHaveValue(
    "inactive",
  );
  await expect(admin.locator(".page-heading .badge")).toHaveText("inactive");
  await teacher.goto(base + "/workspace/classes/" + newClassId);
  await check("Class deactivation revokes an existing teacher session", () =>
    expect(teacher.getByRole("alert")).toContainText("Resource unavailable"),
  );
  await admin.goto(base + "/workspace");
  await expect(
    admin.getByRole("heading", { name: "Class portals", exact: true }),
  ).toBeVisible();
  await expect(admin.locator(".live-grid .card").first()).toBeVisible();
  await admin.screenshot({
    path: "verification/backend-admin-desktop.png",
    fullPage: true,
  });
  await parent.getByRole("button", { name: "Sign out", exact: false }).click();
  await check("Sign out revokes the real session", () =>
    expect(
      parent.getByRole("heading", {
        name: "Sign in to your school",
        exact: true,
      }),
    ).toBeVisible(),
  );
  if (errors.length)
    throw Error("Browser console errors: " + errors.join("; "));
  writeFileSync(
    "verification/backend-browser-results.json",
    JSON.stringify(
      { passed: checks.length, checks, errors, fictionalData: true },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({ passed: checks.length, consoleErrors: errors.length }),
  );
} catch (error) {
  // Credentials are never included in verification output.
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await Promise.all(contexts.map((c) => c.close()));
  await browser.close();
}
