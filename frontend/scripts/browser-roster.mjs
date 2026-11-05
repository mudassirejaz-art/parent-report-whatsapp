import { chromium, expect as baseExpect } from "@playwright/test";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
const expect = baseExpect.configure({ timeout: 20000 }),
  base = "http://127.0.0.1:5173";
const backend = existsSync("backend/.local/account-browser-accounts.json")
  ? "backend"
  : "../backend";
const owner = JSON.parse(
  readFileSync(backend + "/.local/account-browser-accounts.json", "utf8"),
);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const contexts = [],
  checks = [],
  errors = [];
const stamp = Date.now().toString().slice(-9),
  teacher = {
    email: "import-teacher-" + stamp + "@example.test",
    password: randomBytes(18).toString("base64url"),
  };
async function page(width) {
  const c = await browser.newContext({ viewport: { width, height: 950 } });
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
async function login(p, account) {
  await p.goto(base + "/workspace");
  await p.getByLabel("Email address", { exact: true }).fill(account.email);
  await p.getByLabel("Password", { exact: true }).fill(account.password);
  await p
    .getByRole("button", { name: "Sign in", exact: true })
    .click({ noWaitAfter: true });
  await p.getByRole("navigation", { name: "School workspace" }).waitFor();
}
async function mutate(p, path, body, csrf, method = "post") {
  const r = await p.request[method](base + "/api/v1" + path, {
    data: body,
    headers: { "X-CSRF-Token": csrf },
  });
  if (!r.ok())
    throw Error("Fixture request failed: " + path + " status " + r.status());
  return r.json();
}
const csvFile = (content) => ({
  name: "fictitious-students.csv",
  mimeType: "text/csv",
  buffer: Buffer.from(content),
});
const valid =
  'name,admission_number,roll_number\n"Fictitious, Ayesha",ROSTER-' +
  stamp +
  "-01,001\nFictitious Bilal,ROSTER-" +
  stamp +
  "-02,002\n";
try {
  const admin = await page(1440);
  await login(admin, owner);
  const actor = await (
    await admin.request.get(base + "/api/v1/auth/me")
  ).json();
  const csrf = actor.csrf_token,
    school = actor.memberships[0].school_id;
  const classroom = await mutate(
    admin,
    "/classes",
    {
      school_id: school,
      grade: "Import " + stamp,
      section: "A",
      academic_year: "2026-27",
      status: "active",
      sending_enabled: false,
    },
    csrf,
  );
  const teacherResult = await mutate(
    admin,
    "/teachers",
    { school_id: school, name: "Fictitious Import Teacher", ...teacher },
    csrf,
  );
  await mutate(
    admin,
    "/classes/" + classroom.id + "/assignment",
    { teacher_id: teacherResult.id, assigned: true },
    csrf,
    "put",
  );
  const p = await page(390);
  await login(p, teacher);
  await p.goto(base + "/workspace/classes/" + classroom.id);
  await p.getByText("Import students from CSV", { exact: true }).click();
  await check("Assigned teacher sees import tool on mobile", async () => {
    await expect(
      p.getByText(
        "Parent WhatsApp numbers are collected and verified separately through Parent links.",
        { exact: true },
      ),
    ).toBeVisible();
  });
  await check("CSV template downloads", async () => {
    const download = p.waitForEvent("download");
    await p
      .getByRole("button", { name: "Download CSV template", exact: true })
      .click({ noWaitAfter: true });
    expect((await download).suggestedFilename()).toBe(
      "parentreport-students-template.csv",
    );
  });
  const input = p.getByLabel("1. Choose a CSV file", { exact: true }),
    preview = p.getByRole("button", {
      name: "2. Preview and check",
      exact: true,
    });
  await check("Unexpected guardian contact column is rejected", async () => {
    await input.setInputFiles(
      csvFile(
        "name,admission_number,roll_number,phone\nFictitious Name,A,1,0300",
      ),
    );
    await preview.click({ noWaitAfter: true });
    await expect(p.getByRole("alert")).toContainText("no extra columns");
  });
  await check("Duplicate rows are highlighted and cannot import", async () => {
    await input.setInputFiles(
      csvFile(
        "name,admission_number,roll_number\nFictitious A,DUPE,1\nFictitious B,DUPE,1",
      ),
    );
    await preview.click({ noWaitAfter: true });
    await expect(
      p.getByText("Fix the highlighted rows, then choose the corrected file.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      p.getByRole("button", { name: "3. Import students", exact: true }),
    ).toHaveCount(0);
  });
  await check(
    "Valid preview preserves quoted names and leading zeroes without writes",
    async () => {
      await input.setInputFiles(csvFile(valid));
      await preview.click({ noWaitAfter: true });
      await expect(
        p.getByText("All rows are ready to import.", { exact: true }),
      ).toBeVisible();
      await expect(
        p.getByRole("cell", { name: "Fictitious, Ayesha", exact: true }),
      ).toBeVisible();
      await expect(
        p.getByRole("cell", { name: "001", exact: true }),
      ).toBeVisible();
      await expect(
        p.getByRole("button", { name: "3. Import students", exact: true }),
      ).toBeDisabled();
      const r = await p.request.get(base + "/api/v1/classes/" + classroom.id);
      expect((await r.json()).students).toHaveLength(0);
    },
  );
  await check("Choosing another file clears the old preview", async () => {
    await input.setInputFiles(csvFile(valid + "Fictitious Extra,EXTRA,003\n"));
    await expect(
      p.getByRole("heading", { name: "Import preview", exact: true }),
    ).toHaveCount(0);
    await input.setInputFiles(csvFile(valid));
    await preview.click({ noWaitAfter: true });
    await expect(
      p.getByText("All rows are ready to import.", { exact: true }),
    ).toBeVisible();
  });
  await check("Lost import response can be safely retried", async () => {
    const endpoint = "**/api/v1/classes/" + classroom.id + "/students/import";
    await p.route(endpoint, async (route) => {
      await route.fetch();
      await route.abort("failed");
    });
    await p
      .getByLabel("I reviewed these students for this class.", { exact: true })
      .check();
    await p
      .getByRole("button", { name: "3. Import students", exact: true })
      .click({ noWaitAfter: true });
    await expect(p.getByRole("alert")).toContainText("service is unavailable");
    await p.unroute(endpoint);
    await p
      .getByRole("button", { name: "3. Import students", exact: true })
      .click({ noWaitAfter: true });
    await expect(
      p.getByText(
        "2 students imported. Parent verification is still required.",
        { exact: true },
      ),
    ).toBeVisible();
    const r = await p.request.get(base + "/api/v1/classes/" + classroom.id);
    expect((await r.json()).students).toHaveLength(2);
  });
  await check(
    "Roster search finds name and admission identifiers",
    async () => {
      const search = p.getByRole("searchbox", {
        name: "Search students",
        exact: true,
      });
      await search.fill("Ayesha");
      await expect(
        p.getByRole("cell", { name: "Fictitious, Ayesha", exact: true }),
      ).toBeVisible();
      await expect(
        p.getByRole("cell", { name: "Fictitious Bilal", exact: true }),
      ).toHaveCount(0);
      await search.fill("no match");
      await expect(
        p.getByText("No students match your search.", { exact: true }),
      ).toBeVisible();
      await search.fill("");
    },
  );
  await check(
    "Re-uploading the same rows reports existing records",
    async () => {
      await input.setInputFiles(csvFile(valid));
      await preview.click({ noWaitAfter: true });
      await expect(
        p.getByText(
          "Fix the highlighted rows, then choose the corrected file.",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        p.getByText("Admission number is already in use in this school.", {
          exact: true,
        }),
      ).toHaveCount(2);
    },
  );
  await check(
    "Mobile layout stays within viewport with scrollable preview",
    async () =>
      expect(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true),
  );
  await check("Import does not verify any parent", async () => {
    const r = await p.request.get(
      base + "/api/v1/classes/" + classroom.id + "/guardian-links",
    );
    expect(r.ok()).toBe(true);
    const rows = await r.json();
    expect(rows).toHaveLength(2);
    expect(rows.every((x) => x.status === "not_submitted")).toBe(true);
  });
  await check(
    "Revoked teacher assignment blocks a previously valid preview",
    async () => {
      await input.setInputFiles(
        csvFile(
          "name,admission_number,roll_number\nFictitious Revoked,REVOKED-" +
            stamp +
            ",003",
        ),
      );
      await preview.click({ noWaitAfter: true });
      await expect(
        p.getByText("All rows are ready to import.", { exact: true }),
      ).toBeVisible();
      await mutate(
        admin,
        "/classes/" + classroom.id + "/assignment",
        { teacher_id: teacherResult.id, assigned: false },
        csrf,
        "put",
      );
      await p
        .getByLabel("I reviewed these students for this class.", {
          exact: true,
        })
        .check();
      await p
        .getByRole("button", { name: "3. Import students", exact: true })
        .click({ noWaitAfter: true });
      await expect(p.getByRole("alert")).toContainText("unavailable");
      const r = await admin.request.get(
        base + "/api/v1/classes/" + classroom.id,
      );
      expect((await r.json()).students).toHaveLength(2);
    },
  );
  await check("Admin can see the final roster on desktop", async () => {
    await admin.goto(base + "/workspace/classes/" + classroom.id);
    await expect(
      admin.getByRole("cell", { name: "Fictitious Bilal", exact: true }),
    ).toBeVisible();
  });
  await check("No browser runtime errors", async () =>
    expect(errors).toEqual([]),
  );
  writeFileSync(
    "verification/roster-browser-results.json",
    JSON.stringify({ passed: checks.length, checks, errors }, null, 2),
  );
  console.log("ALL", checks.length, "BROWSER CHECKS PASSED");
} finally {
  for (const c of contexts) await c.close();
  await browser.close();
}
