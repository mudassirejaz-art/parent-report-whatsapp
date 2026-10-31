import { describe, it, expect } from "vitest";
import { actionItems } from "./priorities";
import { seed } from "./mocks";
import type { Session } from "./types";
const parent: Session = { id: "g1", role: "parent" },
  other: Session = { id: "g2", role: "parent" },
  teacher: Session = { id: "t1", role: "class_teacher" };
describe("actionable priorities", () => {
  it("surfaces important notices without messaging actions", () => {
    const items = actionItems(seed(), parent);
    expect(items.some((i) => i.id === "notice-school")).toBe(true);
    expect(items.some((i) => i.to.includes("/messages"))).toBe(false);
  });
  it("never leaks another family conversation", () =>
    expect(actionItems(seed(), other).some((i) => i.id === "thread1")).toBe(
      false,
    ));
  it("removes an acknowledged notice from action items", () => {
    const d = seed();
    d.notices[0].acknowledgedBy = ["g1"];
    expect(actionItems(d, parent).some((i) => i.id === "notice-school")).toBe(
      false,
    );
  });
  it("does not expose legacy conversations for either role", () => {
    const d = seed();
    d.messages.forEach((m) => (m.readBy = ["g1"]));
    expect(actionItems(d, parent).some((i) => i.id === "thread1")).toBe(false);
    expect(actionItems(d, teacher).some((i) => i.id === "thread1")).toBe(false);
  });
  it("only authorized class staff see pending leave actions", () => {
    const d = seed();
    d.leaveRequests.push({
      id: "leave-action",
      schoolId: "school",
      classId: "c7",
      studentId: "s6",
      guardianId: "g2",
      from: "2026-10-31",
      to: "2026-11-01",
      reason: "Demo",
      status: "pending",
    });
    expect(actionItems(d, teacher).some((i) => i.id === "leave-action")).toBe(
      false,
    );
    expect(
      actionItems(d, { id: "t2", role: "class_teacher" }).some(
        (i) => i.id === "leave-action",
      ),
    ).toBe(true);
  });
  it("requires an active school and authenticated role", () => {
    const d = seed();
    expect(actionItems(d, null)).toEqual([]);
    d.school.active = false;
    expect(actionItems(d, parent)).toEqual([]);
  });
});
