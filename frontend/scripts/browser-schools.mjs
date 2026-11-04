import { chromium, expect as baseExpect } from "@playwright/test";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
const expect = baseExpect.configure({ timeout: 15000 });
const backend = existsSync("backend/.local/accounts.json")
  ? "backend"
  : "../backend";
const fixture = JSON.parse(
  readFileSync(backend + "/.local/accounts.json", "utf8"),
);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const contexts = [],
  checks = [],
  errors = [];
const base = "http://127.0.0.1:5173",
  suffix = Date.now().toString().slice(-8);
const initial = "Fictitious School " + suffix,
  updated = "Fictitious Lakeview " + suffix,
  finalName = "Lakeview Learning " + suffix;
const adminAccount = {
  email: "school-" + suffix + "@example.test",
  password: randomBytes(18).toString("base64url"),
};
const teacherAccount = {
  email: "teacher-" + suffix + "@example.test",
  password: randomBytes(18).toString("base64url"),
};
const parentAccount = {
  email: "school-parent-" + suffix + "@example.test",
  password: randomBytes(18).toString("base64url"),
};
const logo = readFileSync(new URL("./fixtures/school-logo.png",import.meta.url));
async function check(name, fn) {
  await fn();
  checks.push(name);
  console.log("PASS", name);
}
async function page(width = 1440) {
  const c = await browser.newContext({ viewport: { width, height: 950 } });
  contexts.push(c);
  const p = await c.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  return p;
}
async function login(p, account) {
  await p.goto(base + "/workspace");
  await p.getByLabel("Email address", { exact: true }).fill(account.email);
  await p.getByLabel("Password", { exact: true }).fill(account.password);
  await p.getByRole("button", { name: "Sign in", exact: true }).click();
  await p.getByRole("navigation", { name: "School workspace" }).waitFor();
}
const nav = (p, name) =>
  p
    .getByRole("navigation", { name: "School workspace" })
    .getByRole("link", { name, exact: true });
const tab = (p, name) =>
  p.locator(".live-tabs").getByRole("button", { name, exact: true });
const branded = (p, name) =>
  p.locator(".live-sidebar .brand").getByText(name, { exact: true });
async function post(p, path, body, csrf) {
  const r = await p.request.post(base + "/api/v1" + path, {
    data: body,
    ...(csrf ? { headers: { "X-CSRF-Token": csrf } } : {}),
  });
  if (!r.ok())
    throw Error(
      "Fixture setup endpoint failed: " + path + " status " + r.status(),
    );
  return r.json();
}
try {
  const admin = await page(390);
  await admin.goto(base + "/school/register");
  await expect(
    admin.getByRole("heading", {
      name: "A fresh start for your school",
      exact: true,
    }),
  ).toBeVisible();
  await admin
    .getByLabel("School or academy name", { exact: true })
    .fill(initial);
  await admin
    .getByLabel("School handle · lowercase letters, numbers and hyphens", {
      exact: true,
    })
    .fill("school-" + suffix);
  await admin.getByLabel("City", { exact: true }).fill("Lahore");
  await admin
    .getByLabel("Your full name", { exact: true })
    .fill("Fictitious School Owner");
  await admin
    .getByLabel("Administrator email", { exact: true })
    .fill(adminAccount.email);
  await admin
    .getByLabel("Create password · at least 12 characters", { exact: true })
    .fill(adminAccount.password);
  await admin
    .getByLabel("Confirm password", { exact: true })
    .fill("mismatch-password");
  await admin
    .getByRole("button", { name: "Create school workspace", exact: true })
    .click();
  await check("School signup validates password confirmation", () =>
    expect(admin.getByRole("alert")).toContainText("do not match"),
  );
  await admin
    .getByLabel("Confirm password", { exact: true })
    .fill(adminAccount.password);
  await admin
    .getByRole("button", { name: "Create school workspace", exact: true })
    .click();
  await check("New school and first administrator are created", () =>
    expect(
      admin.getByRole("heading", {
        name: "Your school workspace is ready.",
        exact: true,
      }),
    ).toBeVisible(),
  );
  await admin.evaluate(()=>window.scrollTo({top:0,behavior:"instant"}));
  await admin.screenshot({
    path: "verification/school-registration-mobile.png",
    fullPage: true,
  });
  await admin
    .getByRole("button", { name: "Sign in to your new school", exact: true })
    .click();
  await admin
    .getByLabel("Email address", { exact: true })
    .fill(adminAccount.email);
  await admin
    .getByLabel("Password", { exact: true })
    .fill(adminAccount.password);
  await admin.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    admin.getByRole("heading", { name: "Class portals", exact: true }),
  ).toBeVisible();
  await check(
    "Fresh school starts empty with a clear first-class action",
    async () => {
      await expect(
        admin.getByText(
          "Create your first class portal below, then activate it and assign a teacher.",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(branded(admin, initial)).toBeVisible();
    },
  );
  const schools = await (
      await admin.request.get(base + "/api/v1/schools")
    ).json(),
    sid = schools[0].id;
  if (schools.length !== 1) throw Error("New admin could see other schools");
  await nav(admin, "School settings").click();
  await admin.getByLabel("School name", { exact: true }).fill(updated);
  await admin.getByLabel("City (optional)", { exact: true }).fill("");
  await admin
    .getByLabel("School address (optional)", { exact: true })
    .fill("Fictional campus address");
  await admin
    .getByLabel("School contact email (optional)", { exact: true })
    .fill("office-" + suffix + "@example.test");
  await admin
    .getByLabel("School tagline (optional)", { exact: true })
    .fill("Learning, together.");
  await admin
    .getByLabel("Portal accent colour", { exact: true })
    .evaluate((input) => {
      input.value = "#263a77";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  await admin
    .getByRole("button", { name: "Save school profile", exact: true })
    .click();
  await check(
    "School name and optional contact fields save without losing feedback",
    async () => {
      await expect(
        admin.getByText("School profile saved.", { exact: true }),
      ).toBeVisible();
      await expect(branded(admin, updated)).toBeVisible();
    },
  );
  await check(
    "Saved accent colour themes readable primary controls",
    async () => {
      await expect(
        admin.getByRole("button", { name: "Upload school logo", exact: true }),
      ).toHaveCSS("background-color", "rgb(38, 58, 119)");
    },
  );
  await admin
    .getByLabel("Choose a school logo", { exact: true })
    .setInputFiles({
      name: "not-a-logo.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("not a logo"),
    });
  await admin
    .getByRole("button", { name: "Upload school logo", exact: true })
    .click();
  await check("Logo upload rejects an unsupported file type", () =>
    expect(admin.getByRole("alert")).toContainText("PNG, JPEG or WebP"),
  );
  await admin
    .getByLabel("Choose a school logo", { exact: true })
    .setInputFiles({
      name: "fictional-school.png",
      mimeType: "image/png",
      buffer: logo,
    });
  await admin
    .getByRole("button", { name: "Upload school logo", exact: true })
    .click();
  await check(
    "Logo uploads to PostgreSQL and appears in the school header",
    async () => {
      const image = admin.locator(".live-sidebar img");
      await expect(image).toBeVisible();
      await expect
        .poll(() => image.evaluate((i) => i.naturalWidth))
        .toBeGreaterThan(0);
      await expect(
        admin.getByLabel("Choose a school logo", { exact: true }),
      ).toHaveValue("");
    },
  );
  await admin.reload();
  await check("School identity and logo survive a browser reload", async () => {
    await expect(branded(admin, updated)).toBeVisible();
    await expect(admin.locator(".live-sidebar img")).toBeVisible();
  });
  await admin.setViewportSize({ width: 1440, height: 950 });
  await nav(admin, "Teachers").click();
  await admin.getByText("Add a teacher", { exact: true }).click();
  await admin
    .getByLabel("Teacher name", { exact: true })
    .fill("Fictitious New Teacher");
  await admin
    .getByLabel("Teacher email", { exact: true })
    .fill(teacherAccount.email);
  await admin
    .getByLabel("Initial password · at least 12 characters", { exact: true })
    .fill(teacherAccount.password);
  await admin
    .getByRole("button", { name: "Create teacher account", exact: true })
    .click();
  await expect(
    admin.getByRole("heading", { name: "Fictitious New Teacher", exact: true }),
  ).toBeVisible();
  await nav(admin, "Classes").click();
  await admin.getByText("Create a class portal", { exact: true }).click();
  await admin.getByLabel("Grade", { exact: true }).fill("1");
  await admin.getByLabel("Section", { exact: true }).fill("A");
  await admin
    .getByRole("button", { name: "Create class", exact: true })
    .click();
  await admin.getByRole("link", { name: "Open class", exact: true }).click();
  const cid = new URL(admin.url()).pathname.split("/").at(-1);
  await tab(admin, "Class settings").click();
  await admin
    .getByLabel("Portal status", { exact: true })
    .selectOption("active");
  await admin
    .getByRole("button", { name: "Save portal settings", exact: true })
    .click();
  await expect(admin.locator(".page-heading .badge")).toHaveText("active");
  const assigned = admin
    .locator(".live-line")
    .filter({
      has: admin.getByText("Fictitious New Teacher", { exact: true }),
    });
  await assigned
    .getByRole("button", { name: "Assign teacher", exact: true })
    .click();
  await check(
    "A newly registered school can create and assign its first class",
    () =>
      expect(
        assigned.getByRole("button", {
          name: "Revoke assignment",
          exact: true,
        }),
      ).toBeVisible(),
  );
  const teacher = await page(768);
  await login(teacher, teacherAccount);
  await check(
    "Assigned teacher sees this school's branding and class only",
    async () => {
      await expect(branded(teacher, updated)).toBeVisible();
      await expect(teacher.locator(".live-grid .card")).toHaveCount(1);
      await expect(teacher.locator(".live-sidebar img")).toBeVisible();
    },
  );
  await teacher.getByRole("link", { name: "Open class", exact: true }).click();
  await teacher.getByText("Add a student", { exact: true }).click();
  await teacher
    .getByLabel("Student name", { exact: true })
    .fill("Fictitious New School Child");
  await teacher
    .getByLabel("Admission number", { exact: true })
    .fill("SCHOOL-CHILD");
  await teacher.getByLabel("Roll number", { exact: true }).fill("1");
  await teacher
    .getByRole("button", { name: "Add student", exact: true })
    .click();
  await expect(
    teacher.getByRole("cell", {
      name: "Fictitious New School Child",
      exact: true,
    }),
  ).toBeVisible();
  const actor = await (
    await teacher.request.get(base + "/api/v1/auth/me")
  ).json();
  const roster = await (
    await teacher.request.get(base + "/api/v1/classes/" + cid)
  ).json();
  // Existing onboarding API is used only to prepare a fictional parent fixture for this new tenant.
  const invitation = await post(
    teacher,
    "/classes/" + cid + "/guardian-invites",
    { enrollment_id: roster.students[0].enrollment_id },
    actor.csrf_token,
  );
  const parent = await page(390);
  const submission = await post(parent, "/onboarding/submit", {
    token: invitation.token,
    admission_number: "SCHOOL-CHILD",
    guardian_name: "Fictitious New School Parent",
    phone: "+923" + suffix + "8",
  });
  const info = await post(parent, "/onboarding/verification-info", {
    token: submission.token,
  });
  if (!info.is_simulation) throw Error("Fixture must be marked as simulation");
  await post(parent, "/onboarding/register", {
    token: submission.token,
    code: info.local_test_code,
    consent: true,
    email: parentAccount.email,
    password: parentAccount.password,
  });
  await login(parent, parentAccount);
  await check(
    "Verified local parent sees their school's logo and their child",
    async () => {
      await expect(branded(parent, updated)).toBeVisible();
      await expect(parent.locator(".live-sidebar img")).toBeVisible();
      await expect(parent.locator(".live-child-picker button")).toHaveCount(1);
    },
  );
  await tab(teacher, "Exams").click();
  await teacher.getByText("Create an assessment", { exact: true }).click();
  await teacher
    .getByLabel("Exam name", { exact: true })
    .fill("First school assessment");
  await teacher
    .getByLabel("Subjects · one per line, e.g. Mathematics:100", {
      exact: true,
    })
    .fill("Mathematics:100");
  await teacher
    .getByRole("button", { name: "Create exam", exact: true })
    .click();
  await teacher.getByRole("link", { name: "Open marks", exact: true }).click();
  await teacher.locator(".live-mark").fill("92");
  await teacher
    .getByRole("button", { name: "Save marks", exact: true })
    .click();
  await expect(
    teacher.getByText("Marks saved.", { exact: true }),
  ).toBeVisible();
  await teacher
    .getByRole("button", { name: "Publish reports", exact: true })
    .click();
  await expect(
    teacher.getByRole("heading", {
      name: "Reports are published",
      exact: true,
    }),
  ).toBeVisible();
  const before = await (
    await parent.request.get(base + "/api/v1/reports")
  ).json();
  const reportId = before[0].id;
  await nav(admin, "School settings").click();
  await admin.getByLabel("School name", { exact: true }).fill(finalName);
  await admin
    .getByRole("button", { name: "Save school profile", exact: true })
    .click();
  await expect(branded(admin, finalName)).toBeVisible();
  await nav(teacher, "Classes").click();
  await nav(parent, "Reports").click();
  await check(
    "Branding updates reach teachers and parents on navigation",
    async () => {
      await expect(branded(admin, finalName)).toBeVisible();
      await expect(branded(teacher, finalName)).toBeVisible();
      await expect(branded(parent, finalName)).toBeVisible();
    },
  );
  const after = await (
    await parent.request.get(base + "/api/v1/reports/" + reportId)
  ).json();
  await check(
    "Published reports keep their original recorded school name",
    async () => {
      if (after.snapshot.school_name !== updated)
        throw Error("Published snapshot was rewritten");
    },
  );
  await admin
    .getByRole("button", { name: "Remove school logo", exact: true })
    .click();
  await expect(admin.locator(".live-sidebar img")).toHaveCount(0);
  await teacher.reload();
  await parent.reload();
  await check("Logo removal updates all authorized roles", async () => {
    await expect(admin.locator(".live-sidebar img")).toHaveCount(0);
    await expect(teacher.locator(".live-sidebar img")).toHaveCount(0);
    await expect(parent.locator(".live-sidebar img")).toHaveCount(0);
  });
  await admin
    .getByLabel("Choose a school logo", { exact: true })
    .setInputFiles({
      name: "fictional-school.png",
      mimeType: "image/png",
      buffer: logo,
    });
  await admin
    .getByRole("button", { name: "Upload school logo", exact: true })
    .click();
  await expect(admin.locator(".live-sidebar img")).toBeVisible();
  await parent.reload();
  await expect(parent.locator(".live-sidebar img")).toBeVisible();
  const outsider = await page();
  await login(outsider, fixture.accounts.parent_b);
  await check(
    "An unrelated school's parent cannot read the private logo",
    async () => {
      const r = await outsider.request.get(
        base + "/api/v1/schools/" + sid + "/logo",
      );
      if (r.status() !== 404) throw Error("Logo access leaked");
    },
  );
  await teacher.goto(base + "/workspace/settings");
  await check("Teacher cannot open school administration settings", () =>
    expect(
      teacher.getByRole("heading", {
        name: "School admin access required",
        exact: true,
      }),
    ).toBeVisible(),
  );
  await parent.goto(base + "/workspace/reports/" + reportId);
  await expect(parent.getByText("92%", { exact: true })).toBeVisible();
  for (const width of [390, 768, 1440]) {
    await parent.setViewportSize({ width, height: 950 });
    await check("Branded parent layout fits " + width, async () => {
      if (
        await parent.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        )
      )
        throw Error("Horizontal overflow");
    });
  }
  await parent.setViewportSize({ width: 390, height: 950 });
  await parent.screenshot({
    path: "verification/school-parent-mobile.png",
    fullPage: true,
  });
  await admin.screenshot({
    path: "verification/school-settings-desktop.png",
    fullPage: true,
  });
  writeFileSync(
    backend + "/.local/school-browser-accounts.json",
    JSON.stringify(
      {
        admin: adminAccount,
        teacher: teacherAccount,
        parent: parentAccount,
        school_id: sid,
        school_name: finalName,
        notice: "Fictitious local review accounts; never commit.",
      },
      null,
      2,
    ),
  );
  if (errors.length) throw Error("Browser page errors: " + errors.join(";"));
  writeFileSync(
    "verification/school-browser-results.json",
    JSON.stringify(
      {
        passed: checks.length,
        checks,
        pageErrors: errors,
        fictionalSchool: true,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({ passed: checks.length, pageErrors: errors.length }),
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await Promise.all(contexts.map((c) => c.close()));
  await browser.close();
}
