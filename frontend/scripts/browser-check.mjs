import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const checks = [];
const check = async (name, fn) => {
  await fn();
  checks.push(name);
  console.log("PASS", name);
};
const expectText = async (text) => {
  await page.getByText(text, { exact: false }).first().waitFor();
};
const goto = async (path) => {
  await page.goto("http://127.0.0.1:5173" + path);
  await page.waitForTimeout(400);
};
const role = async (id) => {
  await page.getByLabel("Demo Role Switcher", { exact: true }).selectOption(id);
};
mkdirSync("verification", { recursive: true });
try {
  await goto("/");
  await page.getByRole("button", { name: "Quick explore as admin" }).click();
  await check("Admin overview loads", async () =>
    expectText("A clearer picture of progress."),
  );
  await page.screenshot({
    path: "verification/admin-desktop.png",
    fullPage: true,
  });
  await check("Every school navigation route renders", async () => {
    for (const path of [
      "/admin/classes",
      "/admin/teachers",
      "/admin/students",
      "/admin/exams",
      "/admin/reports",
      "/admin/logs",
      "/admin/settings",
    ]) {
      await goto(path);
      if (await page.getByText("We couldn’t open this view.").count())
        throw Error(path + " crashed");
    }
  });
  await goto("/admin/classes/new");
  await page.getByLabel("Grade / class name").fill("9");
  await page.getByLabel("Section", { exact: true }).fill("A");
  await page.getByLabel("Portal status").selectOption("active");
  await page.getByLabel("Report sending", { exact: true }).selectOption("yes");
  await page
    .getByRole("button", { name: "Create class portal", exact: true })
    .click();
  await check("Admin creates and activates assigned portal", async () =>
    expectText("Class 9-A"),
  );
  await role("t1");
  await check("Teacher A only sees assigned active classes", async () => {
    await expectText("Class 6-A");
    await expectText("Class 9-A");
    if (await page.getByText("Class 7-A", { exact: true }).count())
      throw Error("Unassigned class leaked");
  });
  await goto("/teacher/classes/c7/overview");
  await check("Direct unassigned teacher URL denied", async () =>
    expectText("Access restricted"),
  );
  await role("t3");
  await goto("/teacher/classes/c8/overview");
  await check("Direct inactive class URL denied", async () =>
    expectText("Class inactive"),
  );
  await role("t1");
  await goto("/teacher/classes/c6/students");
  await check("Class roster is isolated", async () => {
    await expectText("Ahmed Hassan");
    if (await page.getByText("Maryam Asif", { exact: true }).count())
      throw Error("Cross-class student leak");
  });
  await check("Class navigation screens render", async () => {
    for (const tab of [
      "overview",
      "students",
      "exams",
      "marks",
      "parents",
      "reports",
      "logs",
    ]) {
      await goto("/teacher/classes/c6/" + tab);
      if (await page.getByText("We couldn’t open this view.").count())
        throw Error(tab + " crashed");
    }
  });
  await goto("/teacher/classes/c6/marks");
  await page
    .getByLabel("Ahmed Hassan Mathematics", { exact: true })
    .fill("101");
  await page.getByRole("button", { name: "Save marks", exact: true }).click();
  await check("Marks over maximum rejected with cell error", async () =>
    expectText("Use 0–100"),
  );
  await page.getByLabel("Ahmed Hassan Mathematics", { exact: true }).fill("88");
  await page.getByRole("button", { name: "Save marks", exact: true }).click();
  await page
    .getByRole("button", { name: "Publish assessment", exact: true })
    .click();
  await check("Marks save and publish", async () =>
    expectText("Published for parents"),
  );
  await goto("/teacher/classes/c6/parents");
  await page
    .getByRole("button", { name: "Generate class onboarding link" })
    .click();
  await page.getByRole("link", { name: "Open student form" }).click();
  await page.getByLabel("Roll / admission number").fill("005");
  await page.getByLabel("Confirm student full name").fill("Ibrahim Shah");
  await page
    .getByLabel("Guardian name (fictional)")
    .fill("Demo Ibrahim Guardian");
  await page.getByLabel("Fictional WhatsApp number").fill("+923000000505");
  await page.getByRole("button", { name: "Submit guardian contact" }).click();
  await check("Student submission is pending, not verified", async () =>
    expectText("Verification pending"),
  );
  await page
    .getByRole("link", { name: "Simulate guardian verification" })
    .click();
  await page.getByLabel("Simulated OTP code").fill("000000");
  await page
    .getByRole("button", { name: "Verify number & record consent" })
    .click();
  await check("Wrong fake OTP rejected", async () =>
    expectText("Incorrect demo code"),
  );
  await page.getByLabel("Simulated OTP code").fill("123456");
  await page
    .getByRole("button", { name: "Verify number & record consent" })
    .click();
  await check("Consent is a separate affirmative action", async () =>
    expectText("Tick the consent box"),
  );
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Verify number & record consent" })
    .click();
  await page.getByRole("link", { name: "Open private parent portal" }).click();
  await check("New guardian sees only newly linked child", async () => {
    await expectText("Ibrahim Shah");
    if (await page.getByText("Ahmed Hassan", { exact: true }).count())
      throw Error("Unrelated child leaked");
  });
  await role("t1");
  await goto("/teacher/classes/c6/reports");
  await page
    .getByRole("button", { name: "Preview", exact: true })
    .first()
    .click();
  await check("Exact sample report and message preview opens", async () =>
    expectText("Simulated WhatsApp message"),
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: /Simulate send/ }).click();
  await check("Campaign shows eligible and skipped counts", async () =>
    expectText("2 eligible / 3 skipped"),
  );
  await page.getByRole("button", { name: "Confirm demo send" }).click();
  await page.waitForTimeout(2000);
  await check("Duplicate campaign blocked", async () => {
    if (
      !(await page
        .getByRole("button", { name: "Campaign simulated" })
        .isDisabled())
    )
      throw Error("Duplicate send enabled");
  });
  await role("g1");
  await check("Parent A sees own child only", async () => {
    await expectText("Ahmed Hassan");
    if (await page.getByText("Ibrahim Shah", { exact: true }).count())
      throw Error("Parent isolation failed");
  });
  await page.getByRole("link", { name: "View progress report" }).click();
  await check("Published private report renders", async () =>
    expectText("255 / 300 marks"),
  );
  await page.screenshot({
    path: "verification/parent-desktop.png",
    fullPage: true,
  });
  await goto("/parent/children/s6/reports/e7");
  await check("Unrelated child direct route denied", async () =>
    expectText("Not authorized"),
  );
  await goto("/parent/children/s1/reports/draft6");
  await check("Unpublished report direct route denied", async () =>
    expectText("Report unavailable"),
  );
  await goto("/admin/dashboard");
  await check("Wrong role route denied", async () =>
    expectText("This page belongs to another role"),
  );
  await goto("/parent/dashboard");
  await role("admin");
  await goto("/admin/classes/c6/settings");
  await page
    .getByRole("button", { name: "Deactivate portal", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm deactivation" }).click();
  await role("t1");
  await goto("/teacher/classes/c6/overview");
  await check("Admin deactivation immediately blocks teacher", async () =>
    expectText("Class inactive"),
  );
  await role("admin");
  await goto("/admin/dashboard");
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    await goto("/admin/dashboard");
    await check(
      `Admin responsive viewport ${width}px has no page overflow`,
      async () => {
        if (
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          )
        )
          throw Error("Horizontal overflow");
      },
    );
    await page.screenshot({
      path: `verification/admin-${width}.png`,
      fullPage: true,
    });
  }
  await role("g1");
  await page.setViewportSize({ width: 390, height: 844 });
  await goto("/parent/dashboard");
  await check("Parent mobile layout has no horizontal overflow", async () => {
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )
    )
      throw Error("Parent overflow");
  });
  await page.screenshot({
    path: "verification/parent-mobile.png",
    fullPage: true,
  });
  await goto("/tour");
  await check("Remotion Player renders and advances", async () => {
    await expectText("A space for every class.");
    await page.getByRole("button", { name: /Play video/ }).click();
    await page.waitForTimeout(7200);
    await expectText("Let progress take shape.");
  });
  await check("No browser runtime exceptions", async () => {
    if (errors.length) throw Error(errors.join("\n"));
  });
  writeFileSync(
    "verification/browser-results.json",
    JSON.stringify({ passed: checks.length, checks, errors }, null, 2),
  );
  console.log(`ALL ${checks.length} BROWSER CHECKS PASSED`);
} finally {
  await browser.close();
}
