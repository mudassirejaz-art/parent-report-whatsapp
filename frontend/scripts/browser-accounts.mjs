import { chromium, expect as baseExpect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { writeFileSync, existsSync } from "node:fs";
const expect = baseExpect.configure({ timeout: 30000 });
const base = "http://127.0.0.1:5173";
const backend = existsSync("backend/.local") ? "backend" : "../backend";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const contexts = [],
  checks = [],
  errors = [];
const stamp = Date.now().toString().slice(-9),
  old = randomBytes(18).toString("base64url"),
  next = randomBytes(18).toString("base64url"),
  final = randomBytes(18).toString("base64url");
const email = "security-" + stamp + "@example.test";
async function page(width = 1440) {
  const c = await browser.newContext({ viewport: { width, height: 960 } });
  contexts.push(c);
  const p = await c.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  return p;
}
async function check(name, fn) {
  await fn();
  checks.push(name);
  console.log("PASS", name);
}
async function login(p, password) {
  await p.goto(base + "/workspace");
  await p.getByLabel("Email address", { exact: true }).fill(email);
  await p.getByLabel("Password", { exact: true }).fill(password);
  await p
    .getByRole("button", { name: "Sign in", exact: true })
    .click({ noWaitAfter: true, timeout: 60000 });
  await p.getByRole("navigation", { name: "School workspace" }).waitFor();
}
try {
  const a = await page(390),
    b = await page();
  const r = await a.request.post(base + "/api/v1/auth/register-school", {
    data: {
      school_name: "Fictitious Security School " + stamp,
      slug: "security-" + stamp,
      city: "Lahore",
      admin_name: "Fictitious Security Owner",
      email,
      password: old,
    },
  });
  if (!r.ok()) throw Error("School fixture creation failed: " + r.status());
  await check("New isolated account signs in on mobile", async () => {
    await login(a, old);
  });
  await login(b, old);
  await check("Account page lists current and other session", async () => {
    await a
      .getByRole("link", { name: "Account & security", exact: true })
      .click({ noWaitAfter: true, timeout: 60000 });
    await expect(
      a.getByRole("heading", { name: "Account & security", exact: true }),
    ).toBeVisible();
    await expect(a.getByText("This browser", { exact: true })).toBeVisible();
    await expect(
      a.getByText("Another signed-in session", { exact: true }),
    ).toBeVisible();
  });
  await check(
    "Revoke another browser session while current stays signed in",
    async () => {
      await a
        .getByRole("button", { name: "Sign out session", exact: true })
        .click({ noWaitAfter: true, timeout: 60000 });
      await expect(
        a.getByText("Another signed-in session", { exact: true }),
      ).toHaveCount(0);
      await b.reload();
      await expect(
        b.getByRole("button", { name: "Sign in", exact: true }),
      ).toBeVisible();
    },
  );
  await login(b, old);
  const tab = await a.context().newPage();
  tab.on("pageerror", (e) => errors.push(e.message));
  await tab.goto(base + "/workspace/account");
  await expect(
    tab.getByRole("heading", { name: "Account & security", exact: true }),
  ).toBeVisible();
  await check("Password mismatch has a clear validation message", async () => {
    await a.getByLabel("Current password", { exact: true }).fill(old);
    await a
      .getByLabel("New password · at least 12 characters", { exact: true })
      .fill(next);
    await a.getByLabel("Confirm new password", { exact: true }).fill("wrong");
    await a
      .getByRole("button", { name: "Update password", exact: true })
      .click({ noWaitAfter: true, timeout: 60000 });
    await expect(a.getByRole("alert")).toContainText("Passwords do not match");
  });
  await check(
    "Password change keeps current browser and refreshes same-browser tabs",
    async () => {
      await a.getByLabel("Confirm new password", { exact: true }).fill(next);
      await a
        .getByRole("button", { name: "Update password", exact: true })
        .click({ noWaitAfter: true, timeout: 60000 });
      await expect(
        a.getByText("Password updated. Other sessions have been signed out.", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        tab.getByRole("heading", { name: "Account & security", exact: true }),
      ).toBeVisible();
      await expect(
        a.getByText("Another signed-in session", { exact: true }),
      ).toHaveCount(0);
    },
  );
  await check("Password fields clear after success", async () => {
    await expect(a.getByLabel("Current password", { exact: true })).toHaveValue(
      "",
    );
  });
  await check("Revoked separate browser is denied", async () => {
    await b.reload();
    await expect(
      b.getByRole("button", { name: "Sign in", exact: true }),
    ).toBeVisible();
  });

  await check("Mobile account page has no horizontal overflow", async () => {
    expect(
      await a.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
  await check("Logout clears private data from another tab", async () => {
    await a
      .getByRole("button", { name: "Sign out", exact: true })
      .click({ noWaitAfter: true, timeout: 60000 });
    await expect(
      tab.getByRole("button", { name: "Sign in", exact: true }),
    ).toBeVisible();
    await expect(
      tab.getByText("Fictitious Security Owner", { exact: true }),
    ).toHaveCount(0);
  });
  await check("Old password rejected and new password accepted", async () => {
    await a.getByLabel("Email address", { exact: true }).fill(email);
    await a.getByLabel("Password", { exact: true }).fill(old);
    await a
      .getByRole("button", { name: "Sign in", exact: true })
      .click({ noWaitAfter: true, timeout: 60000 });
    await expect(a.getByRole("alert")).toContainText("incorrect");
    await a.getByLabel("Password", { exact: true }).fill(next);
    await a
      .getByRole("button", { name: "Sign in", exact: true })
      .click({ noWaitAfter: true, timeout: 60000 });
    await a.getByRole("navigation", { name: "School workspace" }).waitFor();
  });
  const recovery = await page(390);
  let resetPath;
  await check("Recovery explicitly labels local simulation", async () => {
    await recovery.goto(base + "/forgot-password");
    await expect(
      recovery.getByText("Local testing simulation", { exact: true }),
    ).toBeVisible();
    await recovery
      .getByLabel("Account email address", { exact: true })
      .fill(email);
    await recovery
      .getByRole("button", { name: "Create local test link", exact: true })
      .click({ noWaitAfter: true, timeout: 60000 });
    const link = recovery.getByRole("link", {
      name: "Open local reset link →",
      exact: true,
    });
    await expect(link).toBeVisible();
    resetPath = await link.getAttribute("href");
    await link.click({ noWaitAfter: true, timeout: 60000 });
    expect(new URL(recovery.url()).search).toBe("");
  });
  await check("Local recovery resets password without logging in", async () => {
    await recovery
      .getByLabel("New password · at least 12 characters", { exact: true })
      .fill(final);
    await recovery
      .getByLabel("Confirm new password", { exact: true })
      .fill(final);
    await recovery
      .getByRole("button", { name: "Reset password", exact: true })
      .click({ noWaitAfter: true, timeout: 60000 });
    await expect(recovery.getByRole("status")).toContainText(
      "Password reset complete",
    );
    expect(new URL(recovery.url()).hash).toBe("");
  });
  await check("Reset revokes all previous sessions", async () => {
    await a.reload();
    await expect(
      a.getByRole("button", { name: "Sign in", exact: true }),
    ).toBeVisible();
  });
  await check("Reset link cannot be replayed", async () => {
    await recovery.goto(base + resetPath);
    await recovery
      .getByLabel("New password · at least 12 characters", { exact: true })
      .fill(next);
    await recovery
      .getByLabel("Confirm new password", { exact: true })
      .fill(next);
    await recovery
      .getByRole("button", { name: "Reset password", exact: true })
      .click({ noWaitAfter: true, timeout: 60000 });
    await expect(recovery.getByRole("alert")).toContainText("already used");
  });
  await check(
    "Final password signs in and desktop settings render",
    async () => {
      await login(b, final);
      await b
        .getByRole("link", { name: "Account & security", exact: true })
        .click({ noWaitAfter: true, timeout: 60000 });
      await expect(b.getByText("This browser", { exact: true })).toBeVisible();
    },
  );
  await check("No browser runtime errors", async () =>
    expect(errors).toEqual([]),
  );
  writeFileSync(
    backend + "/.local/account-browser-accounts.json",
    JSON.stringify({ email, password: final }, null, 2),
  );
  writeFileSync(
    "verification/account-browser-results.json",
    JSON.stringify({ checks, errors, passed: checks.length }, null, 2),
  );
  console.log("ALL", checks.length, "BROWSER CHECKS PASSED");
} finally {
  for (const c of contexts) await c.close();
  await browser.close();
}
