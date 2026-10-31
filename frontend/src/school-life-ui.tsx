import { useState } from "react";
import { useParams } from "react-router-dom";
import { useStore } from "./store";
import { accessibleStudents, managedClasses } from "./school-life-policy";
import { className } from "./services";
import { Link } from "react-router-dom";
import {
  CalendarCheck,
  Megaphone,
  MessageCircle,
  BookOpenCheck,
} from "lucide-react";
import {
  attendanceSummary,
  canReadNotice,
  canReadConversation,
  localDate,
} from "./school-life-policy";
import { Card } from "./components";
export function useSchoolScope(fixedClassId?: string) {
  const { db, session } = useStore();
  const { studentId } = useParams();
  const [choice, setChoice] = useState("");
  const parent = session?.role === "parent";
  const children = accessibleStudents(db, session).filter(
    (s) => !fixedClassId || s.classId === fixedClassId,
  );
  const classes = managedClasses(db, session);
  const child = studentId
    ? children.find((s) => s.id === studentId)
    : children.find((s) => s.id === choice) || children[0];
  const currentClass = parent
    ? db.classes.find((c) => c.id === child?.classId)
    : classes.find((c) => c.id === (fixedClassId || choice)) ||
      (!fixedClassId ? classes[0] : undefined);
  return {
    db,
    session,
    parent,
    children,
    classes,
    child,
    currentClass,
    choice,
    setChoice,
    denied: !!studentId && !child,
  };
}
export function ScopePicker({
  scope,
  label = "Class",
}: {
  scope: ReturnType<typeof useSchoolScope>;
  label?: string;
}) {
  return scope.parent ? (
    <label className="scope-picker">
      Child
      <select
        aria-label="Select child"
        value={scope.child?.id || ""}
        onChange={(e) => scope.setChoice(e.target.value)}
      >
        {scope.children.map((s) => (
          <option value={s.id} key={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  ) : (
    <label className="scope-picker">
      {label}
      <select
        aria-label={`Select ${label.toLowerCase()}`}
        value={scope.currentClass?.id || ""}
        onChange={(e) => scope.setChoice(e.target.value)}
      >
        {scope.classes.map((c) => (
          <option value={c.id} key={c.id}>
            {className(c)}
          </option>
        ))}
      </select>
    </label>
  );
}
export function LocalOnly() {
  return (
    <details className="demo-details">
      <summary>Demo information</summary>
      <p className="life-demo">
        Demo only · saved in this browser · no SMS, WhatsApp, email or push
        notification is sent.
      </p>
    </details>
  );
}
export function ParentLifeHighlights() {
  const { db, session } = useStore();
  const children = accessibleStudents(db, session);
  if (!children.length) return null;
  const notices = db.notices.filter((n) => canReadNotice(db, session, n));
  const unread = notices.filter((n) => !n.acknowledgedBy.includes(session!.id));
  return (
    <>
      {unread.length > 0 && (
        <Card className="parent-updates">
          <div className="section-head">
            <h2>From your school & teacher</h2>
            <Link className="text-link" to="/parent/notices">
              View notices →
            </Link>
          </div>
          {unread
            .slice()
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, 3)
            .map((n) => (
              <Link className="notice-preview" to="/parent/notices" key={n.id}>
                <span
                  className={
                    "update-dot " + (n.audience === "student" ? "personal" : "")
                  }
                />
                <div>
                  <strong translate="no">{n.title}</strong>
                  <small>
                    {n.audience === "student"
                      ? "Private family note"
                      : n.audience === "school"
                        ? "School announcement"
                        : "Class update"}{" "}
                    · {new Date(n.createdAt).toLocaleDateString("en-PK")}
                  </small>
                </div>
                <span>→</span>
              </Link>
            ))}
        </Card>
      )}
    </>
  );
}
