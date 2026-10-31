import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const checks = [];
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const goto = async (path) => {
  await page.goto("http://127.0.0.1:5173" + path);
  await page.waitForTimeout(350);
};
const text = async (value) =>
  page.getByText(value, { exact: false }).first().waitFor();
const role = async (value) =>
  page.getByLabel("Demo Role Switcher", { exact: true }).selectOption(value);
const pass = async (name, fn) => {
  await fn();
  checks.push(name);
  console.log("PASS", name);
};
async function contact(roll, name, phone) {
  await page.getByLabel("Roll / admission number").fill(roll);
  await page.getByLabel("Confirm student full name").fill(name);
  await page.getByLabel("Guardian name (fictional)").fill("Fictional Guardian");
  await page.getByLabel("Fictional WhatsApp number").fill(phone);
  await page.getByRole("button", { name: "Submit guardian contact" }).click();
}
try {
  await goto("/join/expired-demo");
  await pass("Expired onboarding token denied", () =>
    text("Invitation expired or unavailable"),
  );
  await goto("/join/unknown-token");
  await pass("Unknown onboarding token denied", () =>
    text("Invitation expired or unavailable"),
  );
  await goto("/join/demo-class6");
  await contact("wrong", "Ibrahim Shah", "03000000505");
  await pass("Student identity mismatch rejected", () =>
    text("Student name and roll number do not match"),
  );
  await contact("005", "Ibrahim Shah", "03000000505");
  await pass("Invalid Pakistan number format rejected", () =>
    text("Use the format +923"),
  );
  await contact("005", "Ibrahim Shah", "+923000000505");
  await page
    .getByRole("link", { name: "Simulate guardian verification" })
    .click();
  const verifyUrl = new URL(page.url()).pathname;
  await page.getByRole("button", { name: "Decline messaging consent" }).click();
  await pass("Guardian can explicitly decline consent", () =>
    text("Consent declined"),
  );
  await goto("/join/demo-class6");
  await contact("004", "Fatima Noor", "+923000000505");
  await pass("Duplicate guardian number rejected across students", () =>
    text("already associated with another student"),
  );
  await goto(verifyUrl);
  for (let i = 0; i < 5; i++) {
    await page.getByLabel("Simulated OTP code").fill("000000");
    await page
      .getByRole("button", { name: "Verify number & record consent" })
      .click();
  }
  await pass("Five wrong OTP attempts expire the verification token", () =>
    text("Invitation expired or unavailable"),
  );
  await goto("/");
  await page.getByRole("button", { name: "Quick explore as admin" }).click();
  await goto("/admin/teachers");
  await page
    .getByRole("row")
    .filter({ hasText: "Amina Siddiqui" })
    .getByRole("button", { name: "Suspend access" })
    .click();
  await role("t1");
  await pass("Suspended teacher loses all workspace access", () =>
    text("No active classes assigned"),
  );
  await role("admin");
  await goto("/admin/teachers");
  await page
    .getByRole("row")
    .filter({ hasText: "Amina Siddiqui" })
    .getByRole("button", { name: "Restore access" })
    .click();
  await goto("/admin/classes/c6/settings");
  await page.getByLabel("Amina Siddiqui").uncheck();
  await page.getByLabel("Bilal Ahmed").check();
  await role("t1");
  await goto("/teacher/classes/c6/overview");
  await pass("Revoked teacher assignment blocks direct class URL", () =>
    text("Access restricted"),
  );
  await role("t2");
  await goto("/teacher/classes/c6/overview");
  await pass("Newly assigned teacher gains the activated class", () =>
    text("Class 6-A"),
  );
  await role("admin");
  await goto("/admin/classes/c6/settings");
  await page.getByRole("button", { name: "Pause sending" }).click();
  await role("t2");
  await goto("/teacher/classes/c6/reports");
  await pass("Admin send permission disables teacher campaigns", async () => {
    await text("Sending disabled");
    if (
      !(await page.getByRole("button", { name: /Simulate send/ }).isDisabled())
    )
      throw Error("Sending enabled despite policy");
  });
  await goto("/teacher/classes/c6/exams");
  await page.getByRole("button", { name: "Create exam", exact: true }).first().click();
  await page.getByLabel("Exam name").fill("Edge-case assessment");
  await page.getByLabel("Maximum marks for each subject").fill("50, 75, 100");
  await page.getByRole("dialog", {name:"Create assessment"}).getByRole("button", { name: "Create exam", exact: true }).click();
  await pass("Teacher creates exam with distinct subject maxima", () =>
    text("Mathematics / 50"),
  );
  await page
    .getByRole("row")
    .filter({ hasText: "Edge-case assessment" })
    .getByRole("link", { name: "Enter marks" })
    .click();
  await page.getByRole("button", { name: "Save marks", exact: true }).click();
  await pass("Missing marks rejected with per-cell required errors", () =>
    text("marks need attention"),
  );
  await page.getByLabel("Ahmed Hassan Mathematics", { exact: true }).fill("45");
  await page
    .getByRole("link", { name: "Overview", exact: true })
    .last()
    .click();
  await page.getByRole("link", { name: "Marks entry", exact: true }).click();
  await page
    .getByLabel("Select marks exam")
    .selectOption({ label: "Edge-case assessment" });
  await pass("Unsaved mark drafts survive class navigation", async () => {
    if (
      (await page
        .getByLabel("Ahmed Hassan Mathematics", { exact: true })
        .inputValue()) !== "45"
    )
      throw Error("Draft lost");
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await pass("Teacher marks grid scrolls within mobile page", async () => {
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )
    )
      throw Error("Marks page overflows");
  });
  await page.screenshot({
    path: "verification/teacher-mobile.png",
    fullPage: true,
  });
  await role("g1");
  await goto("/parent/children/s1/reports/e6");
  await page.emulateMedia({ media: "print" });
  await page.screenshot({
    path: "verification/report-print.png",
    fullPage: true,
  });
  await pass("Sample print view hides application navigation", async () => {
    if (await page.locator(".topbar").isVisible())
      throw Error("App nav visible in print");
    await text("Sample progress report");
  });
  await page.emulateMedia({ media: "screen" });
  await pass("No edge-case browser exceptions", async () => {
    if (errors.length) throw Error(errors.join("\n"));
  });
  writeFileSync(
    "verification/edge-results.json",
    JSON.stringify({ passed: checks.length, checks, errors }, null, 2),
  );
  console.log(`ALL ${checks.length} EDGE CHECKS PASSED`);
} finally {
  await browser.close();
}
