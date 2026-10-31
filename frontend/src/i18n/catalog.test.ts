import { describe, it, expect } from "vitest";
import { translate } from "./catalog";
describe("Roman Urdu reading mode", () => {
  it("keeps English untouched", () =>
    expect(translate("Attendance", "en")).toBe("Attendance"));
  it("translates UI labels", () =>
    expect(translate("Attendance", "ur-Latn")).toBe("Hazri"));
  it("preserves unknown school messages and names", () =>
    expect(translate("Ahmed needs his green notebook.", "ur-Latn")).toBe(
      "Ahmed needs his green notebook.",
    ));
  it("preserves whitespace", () =>
    expect(translate("  Save changes  ", "ur-Latn")).toBe(
      "  Tabdeeliyan save karein  ",
    ));
  it("supports personalized portal descriptions", () =>
    expect(
      translate(
        "Your child’s school day and learning story at Crescent School.",
        "ur-Latn",
      ),
    ).toContain("Crescent School"));
});
