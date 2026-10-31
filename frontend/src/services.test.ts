import { describe, it, expect } from "vitest";
import { seed } from "./mocks";
import { canClass, ownChild, eligibility, score } from "./services";
import type { Session } from "./types";
const admin: Session = { role: "school_admin", id: "admin" },
  a: Session = { role: "class_teacher", id: "t1" },
  b: Session = { role: "class_teacher", id: "t2" },
  parent: Session = { role: "parent", id: "g1" };
describe("class scope and immediate revocation", () => {
  it("admin sees all own-school classes, including inactive history", () => {
    const d = seed();
    expect(d.classes.every((c) => canClass(d, admin, c.id))).toBe(true);
  });
  it("teacher A is allowed 6-A and denied 7-A; teacher B is the reverse", () => {
    const d = seed();
    expect(canClass(d, a, "c6")).toBe(true);
    expect(canClass(d, a, "c7")).toBe(false);
    expect(canClass(d, b, "c6")).toBe(false);
    expect(canClass(d, b, "c7")).toBe(true);
  });
  it("inactive class denies its assigned teacher", () =>
    expect(canClass(seed(), { role: "class_teacher", id: "t3" }, "c8")).toBe(
      false,
    ));
  it("deactivation, reassignment and suspension revoke access immediately", () => {
    const d = seed();
    d.classes[0].status = "inactive";
    expect(canClass(d, a, "c6")).toBe(false);
    d.classes[0].status = "active";
    d.classes[0].teacherIds = ["t2"];
    expect(canClass(d, a, "c6")).toBe(false);
    expect(canClass(d, b, "c6")).toBe(true);
    d.teachers[1].suspended = true;
    expect(canClass(d, b, "c6")).toBe(false);
  });
  it("rejects absent sessions, missing classes, foreign school IDs and parent role", () => {
    const d = seed();
    expect(canClass(d, null, "c6")).toBe(false);
    expect(canClass(d, a, "missing")).toBe(false);
    expect(canClass(d, parent, "c6")).toBe(false);
    d.classes[0].schoolId = "foreign";
    expect(canClass(d, admin, "c6")).toBe(false);
  });
  it("school suspension restricts teacher and parent access", () => {
    const d = seed();
    d.school.active = false;
    expect(canClass(d, a, "c6")).toBe(false);
    expect(ownChild(d, parent, "s1")).toBe(false);
  });
});
describe("parent ownership and consent", () => {
  it("only linked child is accessible", () => {
    const d = seed();
    expect(ownChild(d, parent, "s1")).toBe(true);
    expect(ownChild(d, parent, "s6")).toBe(false);
    expect(ownChild(d, a, "s1")).toBe(false);
  });
  it("pending verification cannot access reports", () => {
    const d = seed();
    d.students[0].guardianLinkStatus = "pending";
    expect(ownChild(d, parent, "s1")).toBe(false);
  });
  it("requires both number control and affirmative consent", () => {
    const d = seed();
    d.guardians[0].phoneVerified = false;
    expect(ownChild(d, parent, "s1")).toBe(false);
    d.guardians[0].phoneVerified = true;
    d.guardians[0].consentedAt = undefined;
    expect(ownChild(d, parent, "s1")).toBe(false);
  });
  it("requires a reciprocal explicit relationship", () => {
    const d = seed();
    d.guardians[0].linkedStudentIds = ["s6"];
    expect(ownChild(d, parent, "s1")).toBe(false);
  });
});
describe("report readiness", () => {
  it("rejects an exam or student supplied from another class", () => {
    const d = seed();
    expect(eligibility(d, a, d.classes[0], d.exams[2], d.students[0])).toBe(
      "Resource outside class",
    );
    expect(eligibility(d, a, d.classes[0], d.exams[0], d.students[5])).toBe(
      "Resource outside class",
    );
  });
  it("out-of-range and nonfinite persisted marks are incomplete", () => {
    const d = seed();
    for (const value of [-1, 101, NaN]) {
      d.marks[0].obtained = value;
      expect(score(d, d.exams[0], d.students[0]).complete).toBe(false);
    }
  });
  it("calculates totals from matching student and exam only", () => {
    const d = seed();
    expect(score(d, d.exams[0], d.students[0])).toEqual({
      complete: true,
      total: 255,
      max: 300,
    });
    expect(score(d, d.exams[1], d.students[0]).complete).toBe(false);
  });
  it("permits verified consented published complete reports", () => {
    const d = seed();
    expect(eligibility(d, a, d.classes[0], d.exams[0], d.students[0])).toBe(
      null,
    );
  });
  it("blocks unverified and declined contacts", () => {
    const d = seed();
    expect(eligibility(d, a, d.classes[0], d.exams[0], d.students[1])).toBe(
      "Guardian unverified",
    );
    expect(eligibility(d, a, d.classes[0], d.exams[0], d.students[2])).toBe(
      "Consent declined",
    );
  });
  it("blocks unpublished exams and incomplete marks", () => {
    const d = seed();
    expect(eligibility(d, a, d.classes[0], d.exams[1], d.students[0])).toBe(
      "Exam unpublished",
    );
    d.marks[0].obtained = null;
    expect(eligibility(d, a, d.classes[0], d.exams[0], d.students[0])).toBe(
      "Incomplete marks",
    );
  });
  it("respects sending permission and sender assignment", () => {
    const d = seed();
    d.classes[0].sendingEnabled = false;
    expect(eligibility(d, a, d.classes[0], d.exams[0], d.students[0])).toBe(
      "Sending disabled",
    );
    expect(eligibility(d, b, d.classes[0], d.exams[0], d.students[0])).toBe(
      "Class inactive or access revoked",
    );
  });
  it("requires recorded consent even when status says verified", () => {
    const d = seed();
    d.guardians[0].consentedAt = undefined;
    expect(eligibility(d, a, d.classes[0], d.exams[0], d.students[0])).toBe(
      "Consent missing",
    );
  });
});
