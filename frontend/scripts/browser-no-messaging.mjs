import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
const b = await chromium.launch({ channel: "chrome", headless: true });
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
const checks = [];
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
const pass = async (n, f) => {
  await f();
  checks.push(n);
  console.log("PASS", n);
};
const go = async (path) => p.goto("http://127.0.0.1:5173" + path);
const role = async (id) =>
  p.getByLabel("Demo Role Switcher", { exact: true }).selectOption(id);
try {
  await go("/");
  await p.getByRole("button", { name: "Quick explore as admin" }).click();
  for (const [id, root] of [
    ["admin", "admin"],
    ["t1", "teacher"],
    ["g1", "parent"],
  ]) {
    await role(id);
    await pass(`${root} navigation has no messaging links`, async () => {
      if (await p.locator('a[href*="/messages"]').count())
        throw Error("Messaging link remains");
    });
    await go(`/${root}/messages`);
    await pass(`${root} messaging route is removed`, async () =>
      p.getByRole("heading", { name: "Page not found", exact: true }).waitFor(),
    );
    await go(`/${root}/dashboard`);
  }
  await go("/parent/settings");
  await pass("Parent profile has no contact-teacher button", async () => {
    if (
      await p
        .getByRole("link", { name: "Contact your class teacher →" })
        .count()
    )
      throw Error("Contact link remains");
  });
  await go("/parent/notices");
  await pass("School notices and private notes remain available", async () =>
    p
      .getByRole("heading", { name: "A gentle uniform reminder for Ahmed" })
      .waitFor(),
  );
  await role("t1");
  await go("/teacher/classes/c6/overview");
  await pass("Class tools no longer show a parent inbox", async () => {
    if (
      await p.getByRole("link", { name: "Parent inbox", exact: true }).count()
    )
      throw Error("Inbox remains");
  });
  await go("/teacher/classes/c6/messages");
  await pass("Old class inbox route cannot open messaging", async () =>
    p.getByRole("heading", { name: "Page not found", exact: true }).waitFor(),
  );
  await go("/teacher/dashboard");
  await role("admin");
  await go("/admin/logs");
  await pass("WhatsApp report simulation logs remain available", async () =>
    p.getByText("Every report has a story.", { exact: true }).waitFor(),
  );
  await pass("No runtime errors", async () => {
    if (errors.length) throw Error(errors.join("\n"));
  });
  writeFileSync(
    "verification/no-messaging-results.json",
    JSON.stringify({ passed: checks.length, checks, errors }, null, 2),
  );
} finally {
  await b.close();
}
