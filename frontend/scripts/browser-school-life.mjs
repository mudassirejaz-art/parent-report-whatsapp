import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("response", (response) => {
  if (response.status() >= 400)
    errors.push(`${response.status()} ${response.url()}`);
});
const checks = [];
const pass = async (name, fn) => {
  await fn();
  checks.push(name);
  console.log("PASS", name);
};
const goto = async (path) => {
  await page.goto("http://127.0.0.1:5173" + path);
  await page.waitForTimeout(350);
};
const role = async (id) => {
  await page.getByLabel("Demo Role Switcher", { exact: true }).selectOption(id);
};
const text = async (s) => page.getByText(s, { exact: false }).first().waitFor();
const notText = async (s) => {
  if (await page.getByText(s, { exact: false }).count())
    throw Error("Unexpected private content: " + s);
};
mkdirSync("verification", { recursive: true });
try {
  await goto("/");
  await page.getByRole("button", { name: "Quick explore as admin" }).click();
  await goto("/admin/notices");
  await page
    .getByRole("button", { name: "Create notice", exact: true })
    .click();
  await page
    .getByLabel("Notice audience", { exact: true })
    .selectOption("school");
  await page
    .getByLabel("Notice title", { exact: true })
    .fill("School winter schedule (demo)");
  await page
    .getByLabel("Notice message", { exact: true })
    .fill("School starts at 8:30 am next week. Please arrive on time.");
  await page.getByRole("button", { name: "Save notice", exact: true }).click();
  await pass("School admin publishes a school-wide announcement", () =>
    text("School winter schedule (demo)"),
  );
  await role("t1");
  await goto("/teacher/classes/c6/notices");
  await page
    .getByRole("button", { name: "Create notice", exact: true })
    .click();
  await pass("Teacher cannot choose school-wide notice audience", async () => {
    const options = await page
      .getByLabel("Notice audience", { exact: true })
      .locator("option")
      .allTextContents();
    if (options.some((s) => s.includes("Entire school")))
      throw Error("Teacher can publish school-wide");
  });
  await page
    .getByLabel("Notice audience", { exact: true })
    .selectOption("class");
  await page
    .getByLabel("Notice title", { exact: true })
    .fill("Class 6 library books");
  await page
    .getByLabel("Notice message", { exact: true })
    .fill("Please bring your English library book on Monday.");
  await page.getByRole("button", { name: "Save notice", exact: true }).click();
  await pass("Teacher publishes a class-only notice", () =>
    text("Class 6 library books"),
  );
  await page
    .getByRole("button", { name: "Create notice", exact: true })
    .click();
  await page
    .getByLabel("Notice audience", { exact: true })
    .selectOption("class");
  await page.getByLabel("Category", { exact: true }).selectOption("Uniform");
  await page
    .getByLabel("Notice title", { exact: true })
    .fill("Private uniform check for Ahmed");
  await page
    .getByLabel("Notice message", { exact: true })
    .fill(
      "Please send Ahmed with his school tie tomorrow. This is a private family reminder.",
    );
  await page.getByRole("button", { name: "Save notice", exact: true }).click();
  await pass(
    "Behaviour and uniform notes cannot be broadcast to the class",
    () => text("Behaviour and uniform notes must be private"),
  );
  await page
    .getByLabel("Notice audience", { exact: true })
    .selectOption("student");
  await page
    .getByLabel("Student (used only for private notes)", { exact: true })
    .selectOption("s1");
  await page.getByRole("button", { name: "Save notice", exact: true }).click();
  await pass("Teacher publishes a private student note", () =>
    text("Private uniform check for Ahmed"),
  );
  await goto("/teacher/classes/c6/attendance");
  await page.getByLabel("Register date", { exact: true }).fill("2026-10-31");
  await page
    .getByRole("button", { name: "Mark all present", exact: true })
    .click();
  await page
    .getByLabel("Ahmed Hassan attendance", { exact: true })
    .selectOption("absent");
  await page
    .getByRole("button", { name: "Save attendance", exact: true })
    .click();
  await pass("Teacher saves daily attendance for the assigned class", () =>
    text("Class attendance saved"),
  );
  await role("g1");
  await goto("/parent/dashboard");
  await pass(
    "Parent dashboard surfaces school notices and private notes",
    async () => {
      await text("Private uniform check for Ahmed");
      await text("School winter schedule (demo)");
      await text("Class 6 library books");
    },
  );
  await page.screenshot({
    path: "verification/school-life-parent-desktop.png",
    fullPage: true,
  });
  await goto("/parent/notices");
  const privateCard = page
    .locator(".notice-card")
    .filter({ hasText: "Private uniform check for Ahmed" });
  await privateCard
    .getByRole("button", { name: "Acknowledge notice", exact: true })
    .click();
  await pass("Parent acknowledges the private note", async () => {
    if (
      !(await privateCard
        .getByRole("button", { name: "Acknowledged", exact: true })
        .isDisabled())
    )
      throw Error("Acknowledgement not recorded");
  });
  await goto("/parent/attendance");
  await page.getByLabel("Attendance month", { exact: true }).fill("2026-10");
  await pass(
    "Parent sees accurate own-child attendance and cannot edit it",
    async () => {
      await text("78%");
      if (
        await page
          .getByRole("button", { name: "Save attendance", exact: true })
          .count()
      )
        throw Error("Parent can edit attendance");
      await notText("Ayesha Khan");
    },
  );
  await goto("/parent/children/s6/attendance");
  await pass("Direct unrelated-child attendance URL is denied", () =>
    text("Not authorized"),
  );
  await goto("/parent/dashboard");
  await role("g2");
  await goto("/parent/notices");
  await pass(
    "Other parent sees school notice but not another class or private student note",
    async () => {
      await text("School winter schedule (demo)");
      await notText("Private uniform check for Ahmed");
      await notText("Class 6 library books");
    },
  );
  await role("t1");
  await goto("/teacher/classes/c6/diary");
  await page
    .getByRole("button", { name: "Add diary task", exact: true })
    .click();
  await page.getByLabel("Subject", { exact: true }).fill("Urdu");
  await page
    .getByLabel("Task title", { exact: true })
    .fill("Urdu handwriting practice");
  await page
    .getByLabel("Instructions", { exact: true })
    .fill("Write five neat lines from your Urdu reader.");
  await page.getByLabel("Due date", { exact: true }).fill("2026-11-02");
  await page
    .getByRole("button", { name: "Publish diary task", exact: true })
    .click();
  await pass("Teacher publishes class homework", () =>
    text("Urdu handwriting practice"),
  );
  await role("g1");
  await goto("/parent/diary");
  const task = page
    .locator(".diary-card")
    .filter({ hasText: "Urdu handwriting practice" });
  await task
    .getByRole("button", { name: "Mark parent checked", exact: true })
    .click();
  await pass("Parent checks own child’s homework completion", async () => {
    await task
      .getByRole("button", { name: "Mark as to do", exact: true })
      .waitFor();
  });
  await goto("/parent/leave-requests");
  await page
    .getByRole("button", { name: "Request leave", exact: true })
    .click();
  await page
    .getByLabel("First day of leave", { exact: true })
    .fill("2026-11-04");
  await page
    .getByLabel("Last day of leave", { exact: true })
    .fill("2026-11-03");
  await page
    .getByLabel("Reason for leave", { exact: true })
    .fill("Fictional family event.");
  await page
    .getByRole("button", { name: "Submit leave request", exact: true })
    .click();
  await pass("Leave form rejects reversed dates", () =>
    text("The last day cannot be before the first day"),
  );
  await page
    .getByLabel("First day of leave", { exact: true })
    .fill("2026-11-03");
  await page
    .getByLabel("Last day of leave", { exact: true })
    .fill("2026-11-04");
  await page
    .getByRole("button", { name: "Submit leave request", exact: true })
    .click();
  await pass("Parent submits own-child leave request", () =>
    text("Awaiting teacher review"),
  );
  await role("t1");
  await goto("/teacher/classes/c6/leave-requests");
  await page
    .getByRole("button", { name: "Review request", exact: true })
    .click();
  await page
    .getByLabel("Response to parent", { exact: true })
    .fill("Leave approved. Please collect the homework on return.");
  await page
    .getByRole("button", { name: "Save leave decision", exact: true })
    .click();
  await pass("Teacher reviews and approves leave", () =>
    text("Leave approved. Please collect the homework on return."),
  );
  await role("g1");
  await goto("/parent/leave-requests");
  await pass("Parent sees approved leave and the school response", async () => {
    await text("approved");
    await text("Leave approved. Please collect the homework on return.");
  });
  await goto("/parent/attendance");
  await page.getByLabel("Attendance month", { exact: true }).fill("2026-11");
  await pass("Leave approval never auto-marks attendance", () =>
    text("No attendance recorded this month"),
  );
  await role("admin");
  await goto("/admin/settings");
  await page
    .getByLabel("School name", { exact: true })
    .fill("Crescent Learning School");
  await page
    .getByLabel("School tagline", { exact: true })
    .fill("Learning together, growing together.");
  await page
    .getByRole("button", { name: "Save school identity", exact: true })
    .click();
  await pass("Admin edits school portal identity", () =>
    text("School identity updated across all portals"),
  );
  await page.getByLabel("Upload school logo", { exact: true }).setInputFiles({
    name: "too-large.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(205 * 1024),
  });
  await pass("Oversized school logo rejected clearly", () =>
    text("Choose a logo smaller than 200 KB"),
  );
  await page.getByLabel("Upload school logo", { exact: true }).setInputFiles({
    name: "demo-logo.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await page.locator(".logo-upload-preview").waitFor();
  await page
    .getByLabel("Portal accent", { exact: true })
    .selectOption("#244e78");
  await page
    .getByRole("button", { name: "Save portal appearance", exact: true })
    .click();
  await pass("Admin uploads a valid school logo and saves portal colour", () =>
    text("Logo and portal appearance saved"),
  );
  await role("g1");
  await goto("/parent/dashboard");
  await pass(
    "School branding persists across reload and reaches the parent portal",
    async () => {
      await text("Crescent Learning School");
      if ((await page.locator(".brand-icon img").count()) !== 1)
        throw Error("School logo missing");
      const accent = await page
        .locator(".app")
        .evaluate((el) =>
          getComputedStyle(el).getPropertyValue("--portal-accent"),
        );
      if (accent.trim() !== "#244e78") throw Error("Accent missing");
    },
  );
  await goto("/parent/children/s1/reports/e6");
  await pass(
    "Sample report card carries the school’s identity and uploaded logo",
    async () => {
      await page
        .getByRole("heading", { name: "Crescent Learning School", exact: true })
        .waitFor();
      if (!(await page.locator(".report-logo img").count()))
        throw Error("Report logo missing");
    },
  );
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of [
    "/parent/dashboard",
    "/parent/attendance",
    "/parent/notices",
    "/parent/diary",
    "/parent/leave-requests",
  ]) {
    await goto(path);
    await pass(`Mobile school-life screen fits: ${path}`, async () => {
      if (
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        )
      )
        throw Error("Horizontal overflow: " + path);
    });
  }
  await goto("/parent/dashboard");
  await page.screenshot({
    path: "verification/school-life-parent-mobile.png",
    fullPage: true,
  });
  await goto("/parent/notices");
  await page.screenshot({
    path: "verification/school-life-notices-mobile.png",
    fullPage: true,
  });
  await role("t1");
  await goto("/teacher/classes/c6/attendance");
  await pass("Teacher attendance layout fits mobile", async () => {
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )
    )
      throw Error("Teacher attendance overflow");
  });
  await page.screenshot({
    path: "verification/school-life-attendance-mobile.png",
    fullPage: true,
  });
  await pass("No school-life browser or console errors", async () => {
    if (errors.length) throw Error(errors.join("\n"));
  });
  writeFileSync(
    "verification/school-life-results.json",
    JSON.stringify({ passed: checks.length, checks, errors }, null, 2),
  );
  console.log(`ALL ${checks.length} SCHOOL-LIFE CHECKS PASSED`);
} catch (e) {
  await page.screenshot({
    path: "verification/school-life-failure.png",
    fullPage: true,
  });
  writeFileSync(
    "verification/school-life-failure.txt",
    String(e) + "\n" + (await page.locator("body").innerText()),
  );
  throw e;
} finally {
  await browser.close();
}
