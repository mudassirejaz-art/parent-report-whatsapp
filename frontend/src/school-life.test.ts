import { describe, it, expect, vi, afterEach } from "vitest";
import { seed } from "./mocks";
import { repository } from "./services";
import {
  accessibleStudents,
  canReadNotice,
  canWriteNotice,
  canReadConversation,
  teacherAvailable,
  attendanceSummary,
  managedClasses,
} from "./school-life-policy";
import type { Session, Notice } from "./types";
const admin: Session = { role: "school_admin", id: "admin" },
  teacher: Session = { role: "class_teacher", id: "t1" },
  other: Session = { role: "class_teacher", id: "t2" },
  parent: Session = { role: "parent", id: "g1" },
  otherParent: Session = { role: "parent", id: "g2" };
describe("notice scope and private student notes", () => {
  it("uniform or behaviour feedback is private even for an administrator", () => {
    const d = seed();
    expect(
      canWriteNotice(d, admin, { ...d.notices[0], category: "Uniform" }),
    ).toBe(false);
    expect(
      canWriteNotice(d, teacher, { ...d.notices[1], category: "Behaviour" }),
    ).toBe(false);
  });
  it("suspended teachers cannot read school-wide notices", () => {
    const d = seed();
    d.teachers[0].suspended = true;
    expect(canReadNotice(d, teacher, d.notices[0])).toBe(false);
  });
  it("school announcements reach verified linked parents", () => {
    const d = seed();
    expect(canReadNotice(d, parent, d.notices[0])).toBe(true);
    expect(canReadNotice(d, otherParent, d.notices[0])).toBe(true);
  });
  it("class notices reach only parents in that class", () => {
    const d = seed();
    expect(canReadNotice(d, parent, d.notices[1])).toBe(true);
    expect(canReadNotice(d, otherParent, d.notices[1])).toBe(false);
  });
  it("private uniform notes never reach another family", () => {
    const d = seed();
    expect(canReadNotice(d, parent, d.notices[2])).toBe(true);
    expect(canReadNotice(d, otherParent, d.notices[2])).toBe(false);
    expect(canReadNotice(d, parent, d.notices[3])).toBe(false);
  });
  it("another class teacher cannot read a private note", () => {
    const d = seed();
    expect(canReadNotice(d, teacher, d.notices[2])).toBe(true);
    expect(canReadNotice(d, other, d.notices[2])).toBe(false);
  });
  it("parents cannot see drafts or write notices", () => {
    const d = seed();
    d.notices[0].published = false;
    expect(canReadNotice(d, parent, d.notices[0])).toBe(false);
    expect(canWriteNotice(d, parent, d.notices[1])).toBe(false);
  });
  it("teachers cannot publish school-wide announcements", () => {
    const d = seed();
    expect(canWriteNotice(d, teacher, d.notices[0])).toBe(false);
    expect(canWriteNotice(d, admin, d.notices[0])).toBe(true);
  });
  it("private notes require the student to belong to the target class", () => {
    const d = seed();
    const invalid: Notice = { ...d.notices[2], studentId: "s6" };
    expect(canWriteNotice(d, teacher, invalid)).toBe(false);
  });
  it("inactive or unassigned classes cannot receive new teacher notices", () => {
    const d = seed();
    expect(canWriteNotice(d, other, d.notices[1])).toBe(false);
    d.classes[0].status = "inactive";
    expect(canWriteNotice(d, teacher, d.notices[1])).toBe(false);
  });
  it("foreign-school notices and revoked guardian links are denied", () => {
    const d = seed();
    expect(
      canReadNotice(d, parent, { ...d.notices[0], schoolId: "foreign" }),
    ).toBe(false);
    d.guardians[0].phoneVerified = false;
    expect(canReadNotice(d, parent, d.notices[0])).toBe(false);
  });
});
describe("private family conversations", () => {
  it("only participating parent, assigned teacher and school admin can read", () => {
    const d = seed();
    const thread = d.conversations[0];
    expect(canReadConversation(d, parent, thread)).toBe(true);
    expect(canReadConversation(d, teacher, thread)).toBe(true);
    expect(canReadConversation(d, admin, thread)).toBe(true);
    expect(canReadConversation(d, otherParent, thread)).toBe(false);
    expect(canReadConversation(d, other, thread)).toBe(false);
  });
  it("revoking class assignment removes teacher conversation access", () => {
    const d = seed();
    d.classes[0].teacherIds = ["t2"];
    expect(canReadConversation(d, teacher, d.conversations[0])).toBe(false);
    expect(teacherAvailable(d, d.students[0], "t1")).toBe(false);
  });
  it("guardian account and reciprocal child link must agree", () => {
    const d = seed();
    d.conversations[0].guardianId = "g2";
    expect(canReadConversation(d, parent, d.conversations[0])).toBe(false);
    expect(canReadConversation(d, otherParent, d.conversations[0])).toBe(false);
  });
  it("a suspended teacher or inactive class cannot receive new messages", () => {
    const d = seed();
    d.teachers[0].suspended = true;
    expect(teacherAvailable(d, d.students[0], "t1")).toBe(false);
    d.teachers[0].suspended = false;
    d.classes[0].status = "inactive";
    expect(teacherAvailable(d, d.students[0], "t1")).toBe(false);
  });
  it("school suspension blocks all private school-life data", () => {
    const d = seed();
    d.school.active = false;
    expect(canReadConversation(d, parent, d.conversations[0])).toBe(false);
    expect(canReadNotice(d, parent, d.notices[0])).toBe(false);
    expect(accessibleStudents(d, parent)).toHaveLength(0);
  });
});
describe("attendance, roster scope and data migration", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("attendance percentage uses marked days and counts late as attended", () => {
    const d = seed();
    const summary = attendanceSummary(d, "s1", "2026-10");
    expect(summary.rows).toHaveLength(8);
    expect(summary.absent).toBe(1);
    expect(summary.late).toBe(1);
    expect(summary.percentage).toBe(88);
  });
  it("unmarked months have no invented attendance percentage", () =>
    expect(attendanceSummary(seed(), "s1", "2027-01").percentage).toBe(null));
  it("attendance rosters are limited to linked children or assigned classes", () => {
    const d = seed();
    expect(accessibleStudents(d, parent).map((s) => s.id)).toEqual(["s1"]);
    expect(
      accessibleStudents(d, teacher).every((s) => s.classId === "c6"),
    ).toBe(true);
    expect(managedClasses(d, parent)).toHaveLength(0);
  });
  it("old saved demos gain new features without overwriting school or class edits", () => {
    const old = seed() as unknown as Record<string, unknown>;
    old.school = {
      id: "school",
      name: "Preserved School",
      city: "Karachi",
      active: true,
    };
    for (const key of [
      "attendance",
      "notices",
      "conversations",
      "messages",
      "diary",
      "leaveRequests",
    ])
      delete old[key];
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify(old) });
    const d = repository.load();
    expect(d.school.name).toBe("Preserved School");
    expect(d.attendance.length).toBeGreaterThan(0);
    expect(d.notices).toHaveLength(4);
    expect(d.students).toHaveLength(9);
  });
});
