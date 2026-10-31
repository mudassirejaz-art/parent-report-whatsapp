import { chromium, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
const b = await chromium.launch({ channel: "chrome", headless: true });
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
const checks = [];
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
const check = async (n, f) => {
  await f();
  checks.push(n);
  console.log("PASS", n);
};
const go = async (path) => p.goto("http://127.0.0.1:5173" + path);
try {
  await go("/");
  await p.getByRole("button", { name: "Quick explore as admin" }).click();
  await p.getByLabel("Demo Role Switcher", { exact: true }).selectOption("g1");
  await check("Child report is visible before updates", async () => {
    const child = await p.locator(".child-card").boundingBox();
    const updates = await p.locator(".parent-updates").boundingBox();
    if (!child || !updates || child.y >= updates.y)
      throw Error("Child report not first");
  });
  await check(
    "Repeated welcome, counters and priority cards are removed",
    async () => {
      for (const selector of [
        ".parent-welcome",
        ".family-shortcuts",
        ".priorities",
      ])
        if (await p.locator(selector).count())
          throw Error("Clutter remained: " + selector);
    },
  );
  await check("Essential parent pages remain directly reachable", async () => {
    await expect(p.locator(".parent-essentials").getByRole("link")).toHaveCount(
      3,
    );
  });
  await p.screenshot({
    path: "verification/simple-parent-mobile.png",
    fullPage: true,
  });
  await p.getByRole("button", { name: "Toggle navigation" }).click();
  await p.locator(".nav-more summary").click();
  await p
    .locator(".sidebar")
    .getByRole("link", { name: "Profile & privacy", exact: true })
    .click();
  await check("Secondary parent menu reaches profile settings", async () =>
    p.getByRole("heading", { name: "Your profile. Your choice." }).waitFor(),
  );
  await p.getByLabel("Demo Role Switcher", { exact: true }).selectOption("t1");
  await go("/teacher/classes/c6/overview");
  await check("Only five class tabs are primary", async () =>
    expect(p.locator(".class-tabs a")).toHaveCount(5),
  );
  await p.locator(".workspace-more summary").click();
  await p
    .locator(".workspace-more")
    .getByRole("link", { name: "Homework diary", exact: true })
    .click();
  await check("Secondary class tools retain working navigation", async () =>
    p.getByRole("heading", { name: "Keep the learning going." }).waitFor(),
  );
  await go("/teacher/classes/c7/overview");
  await check("Simplified navigation preserves class permissions", async () =>
    p
      .getByRole("heading", { name: "Access restricted", exact: true })
      .waitFor(),
  );
  await go("/teacher/dashboard");
  await p.getByLabel("Demo Role Switcher", { exact: true }).selectOption("g1");
  await go("/parent/attendance");
  await check("Demo explanation is collapsed by default", async () =>
    expect(p.locator(".demo-details")).not.toHaveAttribute("open", ""),
  );
  await p.getByRole("button", { name: "Roman Urdu", exact: true }).click();
  await check("New navigation supports Roman Urdu", async () =>
    p
      .getByRole("heading", { name: "Bachay ki hazri, aik nazar mein." })
      .waitFor(),
  );
  await check("No horizontal mobile overflow", async () => {
    if (
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    )
      throw Error("Overflow");
  });
  await check("No runtime errors", async () => {
    if (errors.length) throw Error(errors.join("\n"));
  });
  writeFileSync(
    "verification/simple-results.json",
    JSON.stringify({ passed: checks.length, checks, errors }, null, 2),
  );
} finally {
  await b.close();
}
