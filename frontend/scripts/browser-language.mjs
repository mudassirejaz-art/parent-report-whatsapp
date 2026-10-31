import { chromium, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
const b = await chromium.launch({ channel: "chrome", headless: true });
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
const checks = [];
const check = async (name, fn) => {
  await fn();
  checks.push(name);
  console.log("PASS", name);
};
try {
  await p.goto("http://127.0.0.1:5173/");
  await p.getByRole("button", { name: "Quick explore as admin" }).click();
  await p.getByLabel("Demo Role Switcher", { exact: true }).selectOption("g1");
  await p.goto("http://127.0.0.1:5173/parent/settings");
  await p.getByRole("button", { name: "Roman Urdu", exact: true }).click();
  await check("Profile and form labels switch live to Roman Urdu", async () => {
    await p
      .getByRole("heading", { name: "Aap ki profile. Aap ka ikhtiyar." })
      .waitFor();
    await p.getByLabel("Dikhaya janay wala naam", { exact: true }).waitFor();
  });
  await p
    .getByLabel("Dikhaya janay wala naam", { exact: true })
    .fill("Demo Parent A");
  await p
    .getByRole("button", { name: "Tabdeeliyan save karein", exact: true })
    .click();
  await check("Translated form remains functional", async () =>
    expect(
      p.getByLabel("Dikhaya janay wala naam", { exact: true }),
    ).toHaveValue("Demo Parent A"),
  );
  await p.reload();
  await check("Language choice persists on reload", async () =>
    p
      .getByRole("heading", { name: "Aap ki profile. Aap ka ikhtiyar." })
      .waitFor(),
  );
  await p
    .getByRole("navigation", { name: "Parent quick navigation" })
    .getByRole("link", { name: "Hazri", exact: true })
    .click();
  await check("Roman Urdu navigation opens attendance", async () =>
    p
      .getByRole("heading", { name: "Bachay ki hazri, aik nazar mein." })
      .waitFor(),
  );
  await check("Language uses left-to-right Roman Urdu semantics", async () =>
    expect(p.locator("html")).toHaveAttribute("lang", "ur-Latn"),
  );
  await p.getByRole("button", { name: "English", exact: true }).click();
  await check("Switching back restores English", async () =>
    p
      .getByRole("heading", { name: "Their school days, at a glance." })
      .waitFor(),
  );
  await check("Mobile language bar does not overflow", async () => {
    if (
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    )
      throw Error("Overflow");
  });
  await check("No runtime errors", async () => {
    if (errors.length) throw Error(errors.join("\n"));
  });
  writeFileSync(
    "verification/language-results.json",
    JSON.stringify({ passed: checks.length, checks, errors }, null, 2),
  );
} finally {
  await b.close();
}
