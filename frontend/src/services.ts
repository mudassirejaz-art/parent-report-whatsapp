import axios from "axios";
import { seed } from "./mocks";
import type { DB, Session, SchoolClass, Exam, Student } from "./types";
export const apiClient = axios.create({ baseURL: "/api/v1", timeout: 10000 }); // Future backend adapter; never called by the demo.
export const className = (c: SchoolClass) => `Class ${c.grade}-${c.section}`;
export function canClass(db: DB, session: Session | null, id: string) {
  const c = db.classes.find((c) => c.id === id && c.schoolId === db.school.id);
  if (!session || !c || !db.school.active) return false;
  if (session.role === "school_admin") return true;
  return (
    session.role === "class_teacher" &&
    c.status === "active" &&
    c.teacherIds.includes(session.id) &&
    !!db.teachers.find(
      (t) => t.id === session.id && t.schoolId === db.school.id && !t.suspended,
    )
  );
}
export function ownChild(db: DB, session: Session | null, id: string) {
  const s = db.students.find((s) => s.id === id && s.schoolId === db.school.id);
  const g = db.guardians.find((g) => g.id === session?.id);
  return !!(
    db.school.active &&
    session?.role === "parent" &&
    s &&
    s.guardianId === g?.id &&
    s.guardianLinkStatus === "verified" &&
    g?.phoneVerified &&
    g.consentedAt &&
    g.linkedStudentIds.includes(id)
  );
}
export function score(db: DB, e: Exam, s: Student) {
  const values = e.subjects.map(
    (sub) =>
      db.marks.find(
        (m) =>
          m.examId === e.id && m.studentId === s.id && m.subjectId === sub.id,
      )?.obtained,
  );
  return {
    complete:
      e.subjects.length > 0 &&
      values.every(
        (v, i) =>
          v !== null &&
          v !== undefined &&
          Number.isFinite(v) &&
          v >= 0 &&
          v <= e.subjects[i].maximumMarks,
      ),
    total: values.reduce<number>((sum, v) => sum + (v ?? 0), 0),
    max: e.subjects.reduce((sum, s) => sum + s.maximumMarks, 0),
  };
}
export function eligibility(
  db: DB,
  session: Session | null,
  c: SchoolClass,
  e: Exam,
  s: Student,
) {
  if (!canClass(db, session, c.id) || c.status !== "active")
    return "Class inactive or access revoked";
  if (!c.sendingEnabled) return "Sending disabled";
  if (
    e.classId !== c.id ||
    s.classId !== c.id ||
    e.schoolId !== db.school.id ||
    s.schoolId !== db.school.id
  )
    return "Resource outside class";
  if (!e.published) return "Exam unpublished";
  if (!score(db, e, s).complete) return "Incomplete marks";
  const g = db.guardians.find((g) => g.id === s.guardianId);
  if (s.guardianLinkStatus !== "verified" || !g?.phoneVerified)
    return s.guardianLinkStatus === "declined"
      ? "Consent declined"
      : "Guardian unverified";
  if (!g.consentedAt) return "Consent missing";
  return null;
}
export const mockApi = {
  async read<T>(value: T): Promise<T> {
    await new Promise((r) => setTimeout(r, 180));
    return structuredClone(value);
  },
  async fingerprint(phone: string) {
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(phone),
    );
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  },
};

export interface DemoRepository {
  load(): DB;
  commit(db: DB): void;
  reset(): DB;
}
const demoKey = "parentreport-fictional-demo-v1";
export const repository: DemoRepository = {
  load() {
    try {
      const defaults = seed();
      const saved = JSON.parse(
        localStorage.getItem(demoKey) || "null",
      ) as Partial<DB> | null;
      if (!saved) return defaults;
      return {
        ...defaults,
        ...saved,
        school: { ...defaults.school, ...saved.school },
        notices: (saved.notices || defaults.notices).map((n) =>
          n.id === "notice-school"
            ? {
                ...n,
                body: n.body.replace(
                  "Send your class teacher a meeting request from the Teacher contact page to arrange a suitable time.",
                  "Please follow the school noticeboard for meeting arrangements.",
                ),
              }
            : n,
        ),
      };
    } catch {
      return seed();
    }
  },
  commit(db) {
    localStorage.setItem(demoKey, JSON.stringify(db));
  },
  reset() {
    const d = seed();
    this.commit(d);
    return d;
  },
};
