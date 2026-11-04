import { chromium, expect as baseExpect } from "@playwright/test";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
const expect = baseExpect.configure({ timeout: 15000 });
const backend = existsSync("backend/.local/accounts.json")
  ? "backend"
  : "../backend";
const { accounts, ids } = JSON.parse(
  readFileSync(backend + "/.local/accounts.json", "utf8"),
);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const contexts = [],
  checks = [],
  errors = [];
const base = "http://127.0.0.1:5173",
  suffix = Date.now().toString().slice(-8);
const child = "Onboarding Child " + suffix,
  email = "parent-" + suffix + "@example.test",
  password = randomBytes(18).toString("base64url");
async function check(name, fn) {
  await fn();
  checks.push(name);
  console.log("PASS", name);
}
async function page(width = 1280) {
  const c = await browser.newContext({ viewport: { width, height: 900 } });
  contexts.push(c);
  const p = await c.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  return p;
}
async function login(p, mail, pw) {
  await p.goto(base + "/workspace");
  await p.getByLabel("Email address", { exact: true }).fill(mail);
  await p.getByLabel("Password", { exact: true }).fill(pw);
  await p.getByRole("button", { name: "Sign in", exact: true }).click();
  await p.getByRole("navigation", { name: "School workspace" }).waitFor();
}
const tab = (p, name) =>
  p.locator(".live-tabs").getByRole("button", { name, exact: true });
const nav = (p, name) =>
  p
    .getByRole("navigation", { name: "School workspace" })
    .getByRole("link", { name, exact: true });
try {
  const teacher = await page();
  await login(teacher, accounts.teacher_a.email, accounts.teacher_a.password);
  await teacher.goto(base + "/workspace/classes/" + ids.class_a);
  await teacher.getByText("Add a student", { exact: true }).click();
  await teacher.getByLabel("Student name", { exact: true }).fill(child);
  await teacher
    .getByLabel("Admission number", { exact: true })
    .fill("ONBOARD-" + suffix);
  await teacher.getByLabel("Roll number", { exact: true }).fill("ON-" + suffix);
  await teacher
    .getByRole("button", { name: "Add student", exact: true })
    .click();
  await expect(
    teacher.getByRole("cell", { name: child, exact: true }),
  ).toBeVisible();
  await tab(teacher, "Parent links").click();
  const row = teacher
    .locator(".live-guardian-row")
    .filter({
      has: teacher.getByRole("heading", { name: child, exact: true }),
    });
  await row
    .getByRole("button", { name: "Create invitation", exact: true })
    .click();
  const link = row.getByRole("link", {
    name: "Open student form",
    exact: true,
  });
  await expect(link).toBeVisible();
  const invite = await link.getAttribute("href");
  await check(
    "Teacher creates a private student-bound invitation",
    async () => {
      if (!invite.includes("/enroll#")) throw Error("Invalid invitation URL");
    },
  );

  const student = await page(390);
  await student.goto(invite);
  await expect(
    student.getByRole("heading", {
      name: "Link a guardian contact",
      exact: true,
    }),
  ).toBeVisible();
  await student
    .getByLabel("Your admission number", { exact: true })
    .fill("WRONG");
  await student
    .getByLabel("Parent or guardian name", { exact: true })
    .fill("Fictional Onboarding Guardian");
  await student
    .getByLabel("Parent WhatsApp number", { exact: true })
    .fill("+923" + suffix + "7");
  await student
    .getByRole("button", { name: "Submit guardian contact", exact: true })
    .click();
  await check("Wrong admission number cannot submit a parent contact", () =>
    expect(student.getByRole("alert")).toContainText("does not match"),
  );
  await student
    .getByLabel("Your admission number", { exact: true })
    .fill("ONBOARD-" + suffix);
  await student
    .getByRole("button", { name: "Submit guardian contact", exact: true })
    .click();
  await expect(
    student.getByRole("heading", {
      name: "Now the parent completes step 2.",
      exact: true,
    }),
  ).toBeVisible();
  const parentHref = await student
    .getByRole("link", {
      name: "Open separate parent verification",
      exact: true,
    })
    .getAttribute("href");
  await teacher.reload();
  await tab(teacher, "Parent links").click();
  await check(
    "Student submission remains pending before parent verification",
    () => expect(row.locator(".badge")).toHaveText("pending"),
  );

  const parent = await page(390);
  await parent.goto(parentHref);
  const code = await parent.locator(".live-test-code code").textContent();
  await check("Verification is explicitly labelled as local simulation", () =>
    expect(
      parent.getByText("LOCAL VERIFICATION SIMULATION", { exact: true }),
    ).toBeVisible(),
  );
  await parent.getByLabel("Enter local test code", { exact: true }).fill(code);
  await parent.getByLabel("Parent email", { exact: true }).fill(email);
  await parent
    .getByLabel("Create password · at least 12 characters", { exact: true })
    .fill(password);
  await parent.getByLabel("Confirm password", { exact: true }).fill(password);
  await parent
    .getByRole("button", {
      name: "Verify locally & create account",
      exact: true,
    })
    .click();
  await check("Messaging consent is never preselected or inferred", () =>
    expect(parent.getByRole("alert")).toContainText("Choose whether"),
  );
  await parent.getByRole("checkbox").check();
  await parent
    .getByLabel("Enter local test code", { exact: true })
    .fill(code === "000000" ? "111111" : "000000");
  await parent
    .getByRole("button", {
      name: "Verify locally & create account",
      exact: true,
    })
    .click();
  await check("Wrong test code is rejected", () =>
    expect(parent.getByRole("alert")).toContainText(
      "Incorrect local test code",
    ),
  );
  await parent.getByLabel("Enter local test code", { exact: true }).fill(code);
  await parent
    .getByRole("button", {
      name: "Verify locally & create account",
      exact: true,
    })
    .click();
  await check(
    "Parent separately creates a local account and records consent",
    () =>
      expect(
        parent.getByRole("heading", {
          name: "Your parent account is ready.",
          exact: true,
        }),
      ).toBeVisible(),
  );
  await parent.screenshot({
    path: "verification/onboarding-complete-mobile.png",
    fullPage: true,
  });
  writeFileSync(
    backend + "/.local/onboarding-browser-account.json",
    JSON.stringify(
      {
        email,
        password,
        child,
        notice: "Fictional local onboarding browser account; never commit.",
      },
      null,
      2,
    ),
  );
  await parent
    .getByRole("link", { name: "Go to parent sign in", exact: true })
    .click();
  await parent.getByLabel("Email address", { exact: true }).fill(email);
  await parent.getByLabel("Password", { exact: true }).fill(password);
  await parent.getByRole("button", { name: "Sign in", exact: true }).click();
  await check(
    "New parent login sees exactly the verified linked child",
    async () => {
      await expect(parent.locator(".live-child-picker button")).toHaveCount(1);
      await expect(parent.locator(".live-child-picker")).toContainText(child);
      await expect(parent.locator(".live-child-picker")).not.toContainText(
        "Ahmed",
      );
    },
  );
  await teacher.reload();
  await tab(teacher, "Parent links").click();
  await check(
    "Teacher sees masked verified status and explicit local provenance",
    async () => {
      await expect(row.locator(".badge")).toHaveText("verified");
      await expect(row).toContainText("Local simulation");
      await expect(row).toContainText("Consent recorded");
      await expect(row).not.toContainText("+923" + suffix + "7");
    },
  );
  await tab(teacher, "Exams").click();
  await teacher.getByText("Create an assessment", { exact: true }).click();
  await teacher
    .getByLabel("Exam name", { exact: true })
    .fill("Guardian Journey " + suffix);
  await teacher
    .getByLabel("Subjects · one per line, e.g. Mathematics:100", {
      exact: true,
    })
    .fill("Mathematics:100");
  await teacher
    .getByRole("button", { name: "Create exam", exact: true })
    .click();
  const exam = teacher
    .locator(".live-grid .card")
    .filter({
      has: teacher.getByRole("heading", {
        name: "Guardian Journey " + suffix,
        exact: true,
      }),
    });
  await exam.getByRole("link", { name: "Open marks", exact: true }).click();
  const marks = teacher.locator(".live-mark");
  await expect(marks.first()).toBeVisible();
  for (const input of await marks.all()) await input.fill("90");
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
  await nav(parent, "Reports").click();
  await parent
    .locator(".live-grid .card")
    .filter({
      has: parent.getByText("Guardian Journey " + suffix, { exact: true }),
    })
    .getByRole("link", { name: "Read report", exact: true })
    .click();
  const reportUrl = parent.url();
  await check(
    "Newly linked parent receives only their own published report",
    async () => {
      await expect(
        parent.getByRole("heading", { name: child, exact: true }),
      ).toBeVisible();
      await expect(parent.getByText("90%", { exact: true })).toBeVisible();
      await expect(parent.locator(".live-content")).not.toContainText("Ahmed");
    },
  );
  await nav(parent, "Homework & leave").click();
  await parent.getByText("WhatsApp report consent", { exact: true }).click();
  await parent
    .getByRole("button", { name: "Withdraw WhatsApp consent", exact: true })
    .click();
  await check("Parent can withdraw WhatsApp consent", () =>
    expect(
      parent.getByText("Consent withdrawn", { exact: true }),
    ).toBeVisible(),
  );
  await parent.goto(reportUrl);
  await check("Withdrawing message consent preserves owned report access", () =>
    expect(
      parent.getByRole("heading", { name: child, exact: true }),
    ).toBeVisible(),
  );
  const other = await page();
  await login(other, accounts.parent_b.email, accounts.parent_b.password);
  await other.goto(reportUrl);
  await check(
    "An unrelated parent cannot open the newly linked child's report",
    () =>
      expect(other.getByRole("alert")).toContainText("Resource unavailable"),
  );
  await student.goto(invite);
  await student.reload();
  await check("The consumed student invitation cannot be reused", () =>
    expect(student.getByRole("alert")).toContainText("Invitation"),
  );
  const replay = await page(390);
  await replay.goto(parentHref);
  await check("The completed parent verification cannot be replayed", () =>
    expect(replay.getByRole("alert")).toContainText("Verification"),
  );
  await replay.goto(base + "/enroll");
  await check("Incomplete invitation URLs have a clear recovery state", () =>
    expect(
      replay.getByRole("heading", {
        name: "This invitation link is incomplete",
        exact: true,
      }),
    ).toBeVisible(),
  );
  if (
    await parent.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    )
  )
    throw Error("Mobile overflow");
  if (errors.length) throw Error("Browser page errors: " + errors.join(";"));
  writeFileSync(
    "verification/onboarding-browser-results.json",
    JSON.stringify(
      {
        passed: checks.length,
        checks,
        pageErrors: errors,
        simulationOnly: true,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      passed: checks.length,
      pageErrors: errors.length,
      providerCalls: 0,
    }),
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await Promise.all(contexts.map((c) => c.close()));
  await browser.close();
}
