import { useEffect, useState } from "react";
import {
  CalendarCheck,
  Check,
  Clock,
  UserMinus,
  CalendarDays,
} from "lucide-react";
import { useStore } from "./store";
import { Badge, Button, Card, Denied, Empty, PageTitle } from "./components";
import { ScopePicker, useSchoolScope, LocalOnly } from "./school-life-ui";
import { attendanceSummary, localDate } from "./school-life-policy";
import { canClass, className } from "./services";
import type { AttendanceStatus } from "./types";
export function AttendancePage({ classId }: { classId?: string }) {
  const scope = useSchoolScope(classId);
  const { db, session, update, notify } = useStore();
  const { parent, child, currentClass } = scope;
  const [date, setDate] = useState(localDate());
  const [month, setMonth] = useState(localDate().slice(0, 7));
  const [draft, setDraft] = useState<Record<string, AttendanceStatus | "">>({});
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const roster = db.students.filter(
    (s) => s.classId === currentClass?.id && s.schoolId === db.school.id,
  );
  useEffect(() => {
    const values: Record<string, AttendanceStatus | ""> = {};
    for (const s of db.students.filter((s) => s.classId === currentClass?.id))
      values[s.id] =
        db.attendance.find((a) => a.studentId === s.id && a.date === date)
          ?.status || "";
    setDraft(values);
    setDirty(false);
    setError("");
  }, [date, currentClass?.id, db.attendance]);
  if (scope.denied) return <Denied title="Not authorized" />;
  if (parent && !child) return <Empty title="No verified children linked" />;
  if (!parent && !currentClass) return <Empty title="No accessible classes" />;
  const summary = child ? attendanceSummary(db, child.id, month) : null;
  const rows =
    summary?.rows.slice().sort((a, b) => b.date.localeCompare(a.date)) || [];
  return (
    <>
      <PageTitle
        eyebrow={parent ? "EVERY SCHOOL DAY COUNTS" : "DAILY CLASS REGISTER"}
        title={
          parent
            ? "Their school days, at a glance."
            : "A simple start to every school day."
        }
        description={
          parent
            ? "View only your child’s recorded attendance. Unrecorded days are never counted as absences."
            : "Record present, absent, late, or approved leave for your class."
        }
      />
      <div className="toolbar">
        {!classId && <ScopePicker scope={scope} />}
        <label>
          {parent ? "Month" : "Register date"}
          <input
            aria-label={parent ? "Attendance month" : "Register date"}
            type={parent ? "month" : "date"}
            value={parent ? month : date}
            max={parent ? undefined : localDate()}
            onChange={(e) =>
              parent ? setMonth(e.target.value) : setDate(e.target.value)
            }
          />
        </label>
        {!parent && (
          <Badge>{dirty ? "unsaved changes" : "saved register"}</Badge>
        )}
      </div>
      <LocalOnly />
      {parent && summary ? (
        <>
          <div className="attendance-stats">
            {[
              {
                label: "Attendance",
                value:
                  summary.percentage === null ? "—" : summary.percentage + "%",
                Icon: CalendarCheck,
              },
              { label: "Present", value: summary.present, Icon: Check },
              { label: "Late", value: summary.late, Icon: Clock },
              { label: "Absent", value: summary.absent, Icon: UserMinus },
              { label: "On leave", value: summary.leave, Icon: CalendarDays },
            ].map((x) => (
              <Card key={x.label}>
                <x.Icon size={20} />
                <strong>{x.value}</strong>
                <small>{x.label}</small>
              </Card>
            ))}
          </div>
          <p className="helper">
            Percentage = (present + late) ÷ recorded school days. Only marked
            dates are included; holidays and unrecorded dates are excluded.
          </p>
          <Card>
            <h2>
              {child!.name} · {month}
            </h2>
            <div className="attendance-calendar">
              {rows.map((a) => (
                <div key={a.id}>
                  <span>
                    {new Date(a.date + "T12:00:00").toLocaleDateString(
                      "en-PK",
                      { weekday: "short", day: "numeric", month: "short" },
                    )}
                  </span>
                  <Badge>{a.status}</Badge>
                </div>
              ))}
            </div>
            {!rows.length && (
              <Empty title="No attendance recorded this month">
                Your teacher’s saved register will appear here.
              </Empty>
            )}
          </Card>
        </>
      ) : (
        <Card>
          <div className="section-head">
            <div>
              <h2>
                {className(currentClass!)} · {date}
              </h2>
              <p className="muted">
                {roster.length} students · mark every student before saving
              </p>
            </div>
            <div className="inline-actions">
              <Button
                secondary
                disabled={currentClass!.status !== "active" || !roster.length}
                onClick={() => {
                  setDraft(
                    Object.fromEntries(roster.map((s) => [s.id, "present"])),
                  );
                  setDirty(true);
                }}
              >
                Mark all present
              </Button>
              <Button
                disabled={!dirty || currentClass!.status !== "active"}
                onClick={() => {
                  if (
                    !canClass(db, session, currentClass!.id) ||
                    currentClass!.status !== "active"
                  )
                    return;
                  if (!date || date > localDate()) {
                    setError("Choose today or a past school day.");
                    return;
                  }
                  if (roster.some((s) => !draft[s.id])) {
                    setError("Mark every student before saving the register.");
                    return;
                  }
                  update((d) => {
                    d.attendance = d.attendance.filter(
                      (a) => a.classId !== currentClass!.id || a.date !== date,
                    );
                    roster.forEach((s) =>
                      d.attendance.push({
                        id: crypto.randomUUID(),
                        schoolId: d.school.id,
                        classId: currentClass!.id,
                        studentId: s.id,
                        date,
                        status: draft[s.id] as AttendanceStatus,
                        recordedBy: session!.id,
                      }),
                    );
                  });
                  setDirty(false);
                  setError("");
                  notify(
                    "Class attendance saved. Linked parents can now view it.",
                  );
                }}
              >
                Save attendance
              </Button>
            </div>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {currentClass!.status !== "active" && (
            <p className="error">Activate this class to record attendance.</p>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Roll</th>
                  <th>Attendance status</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.name}</strong>
                    </td>
                    <td>{s.rollNumber}</td>
                    <td>
                      <select
                        aria-label={`${s.name} attendance`}
                        value={draft[s.id] || ""}
                        disabled={currentClass!.status !== "active"}
                        onChange={(e) => {
                          setDraft({
                            ...draft,
                            [s.id]: e.target.value as AttendanceStatus,
                          });
                          setDirty(true);
                        }}
                      >
                        <option value="">Not marked</option>
                        {["present", "absent", "late", "leave"].map((v) => (
                          <option value={v} key={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!roster.length && (
            <Empty title="Add students to start the register" />
          )}
        </Card>
      )}
    </>
  );
}
