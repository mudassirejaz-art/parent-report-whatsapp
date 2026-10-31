import type { DB, Session, Notice, Conversation, Student } from "./types";
import { canClass, ownChild } from "./services";
export const localDate = () => {
  const now = new Date();
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
};
export const isAdmin = (db: DB, s: Session | null) =>
  !!s && s.role === "school_admin" && db.school.active;
export function managedClasses(db: DB, s: Session | null) {
  return db.classes.filter((c) => canClass(db, s, c.id));
}
export function accessibleStudents(db: DB, s: Session | null) {
  return db.students.filter(
    (child) =>
      child.schoolId === db.school.id &&
      (s?.role === "parent"
        ? ownChild(db, s, child.id)
        : canClass(db, s, child.classId)),
  );
}
export function canReadNotice(db: DB, s: Session | null, n: Notice) {
  if (!s || !db.school.active || n.schoolId !== db.school.id) return false;
  if (isAdmin(db, s)) return true;
  if (s.role === "class_teacher") {
    if (
      !db.teachers.some(
        (t) => t.id === s.id && t.schoolId === db.school.id && !t.suspended,
      )
    )
      return false;
    if (n.audience === "school") return n.published;
    if (!n.classId || !canClass(db, s, n.classId)) return false;
    return (
      n.audience === "class" ||
      db.students.some(
        (child) =>
          child.id === n.studentId &&
          child.classId === n.classId &&
          child.schoolId === db.school.id,
      )
    );
  }
  if (!n.published) return false;
  const children = accessibleStudents(db, s);
  return n.audience === "school"
    ? children.length > 0
    : n.audience === "class"
      ? children.some((c) => c.classId === n.classId)
      : children.some((c) => c.id === n.studentId && c.classId === n.classId);
}
export function canWriteNotice(
  db: DB,
  s: Session | null,
  n: Pick<
    Notice,
    "schoolId" | "audience" | "classId" | "studentId" | "category"
  >,
) {
  if (
    !s ||
    !db.school.active ||
    n.schoolId !== db.school.id ||
    s.role === "parent"
  )
    return false;
  if (["Behaviour", "Uniform"].includes(n.category) && n.audience !== "student")
    return false;
  if (n.audience === "school") return isAdmin(db, s);
  if (
    !n.classId ||
    !canClass(db, s, n.classId) ||
    db.classes.find((c) => c.id === n.classId)?.status !== "active"
  )
    return false;
  return (
    n.audience === "class" ||
    db.students.some(
      (c) =>
        c.id === n.studentId &&
        c.classId === n.classId &&
        c.schoolId === db.school.id,
    )
  );
}
export function canReadConversation(
  db: DB,
  s: Session | null,
  t: Conversation,
) {
  if (!s || !db.school.active || t.schoolId !== db.school.id) return false;
  const child = db.students.find(
    (c) =>
      c.id === t.studentId &&
      c.classId === t.classId &&
      c.schoolId === db.school.id,
  );
  if (!child) return false;
  if (isAdmin(db, s)) return true;
  if (s.role === "class_teacher")
    return t.teacherId === s.id && canClass(db, s, t.classId);
  return (
    t.guardianId === s.id &&
    child.guardianId === s.id &&
    ownChild(db, s, child.id)
  );
}
export function teacherAvailable(db: DB, student: Student, teacherId: string) {
  const c = db.classes.find(
    (c) => c.id === student.classId && c.schoolId === db.school.id,
  );
  return !!(
    db.school.active &&
    c?.status === "active" &&
    c.teacherIds.includes(teacherId) &&
    db.teachers.some(
      (t) => t.id === teacherId && !t.suspended && t.schoolId === db.school.id,
    )
  );
}
export function attendanceSummary(db: DB, studentId: string, month: string) {
  const rows = db.attendance.filter(
    (a) =>
      a.studentId === studentId &&
      a.schoolId === db.school.id &&
      a.date.startsWith(month),
  );
  const present = rows.filter((a) => a.status === "present").length,
    late = rows.filter((a) => a.status === "late").length;
  return {
    rows,
    present,
    late,
    absent: rows.filter((a) => a.status === "absent").length,
    leave: rows.filter((a) => a.status === "leave").length,
    percentage: rows.length
      ? Math.round(((present + late) / rows.length) * 100)
      : null,
  };
}
