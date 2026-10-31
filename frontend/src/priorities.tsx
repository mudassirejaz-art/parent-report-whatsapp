import { Link } from "react-router-dom";
import { ArrowUpRight, CheckCircle2, Clock3 } from "lucide-react";
import { useStore } from "./store";
import { Card } from "./components";
import {
  accessibleStudents,
  canReadNotice,
  canReadConversation,
  localDate,
} from "./school-life-policy";
import { canClass } from "./services";
import type { DB, Session } from "./types";
export type ActionItem = {
  id: string;
  title: string;
  detail: string;
  to: string;
  urgent: boolean;
};
export function actionItems(db: DB, session: Session | null): ActionItem[] {
  if (!session || !db.school.active) return [];
  const parent = session.role === "parent",
    today = localDate(),
    items: ActionItem[] = [];
  const children = accessibleStudents(db, session);
  if (parent) {
    for (const n of db.notices.filter(
      (n) =>
        canReadNotice(db, session, n) &&
        !n.acknowledgedBy.includes(session.id) &&
        n.priority === "important",
    ))
      items.push({
        id: n.id,
        title: n.title,
        detail: "Important school notice · acknowledgement requested",
        to: "/parent/notices",
        urgent: true,
      });
    for (const child of children)
      for (const task of db.diary.filter(
        (t) =>
          t.schoolId === db.school.id &&
          t.classId === child.classId &&
          !t.completedStudentIds.includes(child.id) &&
          t.dueDate <= today,
      ))
        items.push({
          id: task.id + child.id,
          title: task.title,
          detail: `${child.name} · ${task.dueDate === today ? "Due today" : "Past due " + task.dueDate} · parent check requested`,
          to: "/parent/diary",
          urgent: task.dueDate < today,
        });
  } else {
    for (const request of db.leaveRequests.filter(
      (r) =>
        r.schoolId === db.school.id &&
        r.status === "pending" &&
        canClass(db, session, r.classId),
    ))
      items.push({
        id: request.id,
        title: "Review leave request",
        detail: `${db.students.find((s) => s.id === request.studentId)?.name || "Student"} · ${request.from} to ${request.to}`,
        to:
          session.role === "school_admin"
            ? "/admin/leave-requests"
            : `/teacher/classes/${request.classId}/leave-requests`,
        urgent: request.from <= today,
      });
    for (const c of db.classes.filter(
      (c) => c.status === "active" && canClass(db, session, c.id),
    )) {
      const roster = children.filter((s) => s.classId === c.id);
      const missing = roster.filter(
        (s) =>
          !db.attendance.some((a) => a.studentId === s.id && a.date === today),
      );
      if (missing.length)
        items.push({
          id: "register" + c.id,
          title: `Class ${c.grade}-${c.section}: finish attendance`,
          detail: `${missing.length} students not marked today · confirm it is a school day`,
          to: `/${session.role === "school_admin" ? "admin" : "teacher"}/classes/${c.id}/attendance`,
          urgent: false,
        });
    }
  }
  return items.sort((a, b) => Number(b.urgent) - Number(a.urgent));
}
export function Priorities() {
  const { db, session } = useStore();
  const items = actionItems(db, session);
  return (
    <Card className="priorities">
      <div className="section-head">
        <div>
          <p className="eyebrow">YOUR NEXT USEFUL STEP</p>
          <h2>
            {items.length ? "Needs your attention" : "You’re up to date."}
          </h2>
        </div>
        <span className="priority-count">
          {items.length ? (
            `${items.length} pending`
          ) : (
            <CheckCircle2 size={23} />
          )}
        </span>
      </div>
      {items.length ? (
        items.slice(0, 5).map((item) => (
          <Link className="priority-row" to={item.to} key={item.id}>
            <span
              className={
                item.urgent ? "priority-symbol urgent" : "priority-symbol"
              }
            >
              <Clock3 size={18} />
            </span>
            <div>
              <strong>{item.title}</strong>
              <small>{item.detail}</small>
            </div>
            <ArrowUpRight size={17} />
          </Link>
        ))
      ) : (
        <p className="muted">
          No urgent notices, overdue homework or unread conversations need your
          action.
        </p>
      )}
      {items.length > 5 && (
        <p className="helper">
          Showing the first 5 priorities. Other items remain available in their
          respective pages.
        </p>
      )}
    </Card>
  );
}
