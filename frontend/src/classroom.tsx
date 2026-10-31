import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate, useParams } from "react-router-dom";
import {
  Plus,
  ArrowUpRight,
  Users,
  ShieldCheck,
  Copy,
  Trash2,
  PenLine,
  BookOpen,
} from "lucide-react";
import { useStore } from "./store";
import {
  Badge,
  Button,
  Card,
  Denied,
  Empty,
  Form,
  Modal,
  PageTitle,
} from "./components";
import { canClass, className, score } from "./services";
import { ClassCards, ClassSettings } from "./admin";
import { Reports, Logs } from "./reports";
import type { SchoolClass, Student, Exam } from "./types";
import { AttendancePage } from "./attendance";
import { Noticeboard } from "./notices";

import { HomeworkDiary } from "./diary";
import { LeaveRequests } from "./leaves";
import { Priorities } from "./priorities";
export function TeacherDashboard() {
  const { db, session } = useStore();
  const classes = db.classes.filter((c) => canClass(db, session, c.id));
  return (
    <>
      <PageTitle
        eyebrow="YOUR CLASSROOM WORKSPACE"
        title={`Hello, ${db.teachers.find((t) => t.id === session?.id)?.name.split(" ")[0] || "teacher"}.`}
        description="A little less admin. A little more time for your students."
      />
      <Priorities />
      <ClassCards classes={classes} />
      {classes.length === 0 && (
        <Empty title="No active classes assigned">
          Your school admin can activate a portal and grant you access.
        </Empty>
      )}
      <Card className="info-card">
        <ShieldCheck />
        <div>
          <h3>A workspace that stays yours.</h3>
          <p>
            You can only open active classes assigned to your teacher account.
          </p>
          <Link
            className="text-link"
            to={`/teacher/classes/${session?.id === "t1" ? "c7" : "c6"}/overview`}
          >
            Try an unassigned class route →
          </Link>
        </div>
      </Card>
    </>
  );
}
export function Classroom() {
  const { classId = "", tab = "overview", examId } = useParams();
  const { db, session } = useStore();
  const c = db.classes.find(
    (c) => c.id === classId && c.schoolId === db.school.id,
  );
  const admin = session?.role === "school_admin";
  if (!c) return <Denied title="Class not found" />;
  if (!canClass(db, session, c.id))
    return (
      <Denied
        title={c.status !== "active" ? "Class inactive" : "Access restricted"}
        message="Only assigned, unsuspended teachers may open an active class portal. Ask your school admin to review access."
      />
    );
  const root = admin ? `/admin/classes/${c.id}` : `/teacher/classes/${c.id}`;
  const activeTab = examId ? "marks" : tab;
  const tabs = [
    ["overview", "Overview"],
    ["students", "Students"],
    ["attendance", "Attendance"],
    ["notices", "Notices & notes"],

    ["diary", "Homework diary"],
    ["leave-requests", "Leave requests"],
    ["exams", "Exams"],
    ["marks", "Marks entry"],
    ["parents", "Parent links"],
    ["reports", "Send reports"],
    ["logs", "Message logs"],
    ...(admin ? [["settings", "Portal settings"]] : []),
  ];
  return (
    <>
      <Link
        className="text-link"
        to={admin ? "/admin/classes" : "/teacher/dashboard"}
      >
        ← {admin ? "All class portals" : "My classes"}
      </Link>
      <PageTitle
        eyebrow="CLASS PORTAL · 2026–27"
        title={className(c)}
        description={`${
          db.teachers
            .filter((t) => c.teacherIds.includes(t.id))
            .map((t) => t.name)
            .join(", ") || "No teacher assigned"
        } · ${db.students.filter((s) => s.classId === c.id).length} students`}
        action={
          <>
            <Badge>{c.status}</Badge>
            <Badge>
              {c.sendingEnabled ? "sending enabled" : "sending paused"}
            </Badge>
          </>
        }
      />
      <nav className="class-tabs">
        {tabs
          .filter(([path]) =>
            ["overview", "attendance", "marks", "notices", "exams"].includes(
              path,
            ),
          )
          .map(([path, label]) => (
            <NavLink
              key={path}
              className={activeTab === path ? "active" : ""}
              to={`${root}/${path}`}
            >
              {label}
            </NavLink>
          ))}
      </nav>
      <details
        className="workspace-more"
        open={
          !["overview", "attendance", "marks", "notices", "exams"].includes(
            activeTab,
          ) || undefined
        }
      >
        <summary>More class tools</summary>
        <div>
          {tabs
            .filter(
              ([path]) =>
                ![
                  "overview",
                  "attendance",
                  "marks",
                  "notices",
                  "exams",
                ].includes(path),
            )
            .map(([path, label]) => (
              <NavLink
                key={path}
                to={`${root}/${path}`}
                className={activeTab === path ? "active" : ""}
              >
                {label}
              </NavLink>
            ))}
        </div>
      </details>
      {activeTab === "overview" ? (
        <ClassOverview c={c} root={root} />
      ) : activeTab === "settings" && admin ? (
        <ClassSettings classId={c.id} />
      ) : activeTab === "students" ? (
        <Students key={c.id} classId={c.id} />
      ) : activeTab === "attendance" ? (
        <AttendancePage key={c.id} classId={c.id} />
      ) : activeTab === "notices" ? (
        <Noticeboard key={c.id} classId={c.id} />
      ) : activeTab === "diary" ? (
        <HomeworkDiary key={c.id} classId={c.id} />
      ) : activeTab === "leave-requests" ? (
        <LeaveRequests key={c.id} classId={c.id} />
      ) : activeTab === "exams" ? (
        <Exams key={c.id} classId={c.id} root={root} />
      ) : activeTab === "marks" ? (
        <Marks key={c.id} classId={c.id} examId={examId} />
      ) : activeTab === "parents" ? (
        <ParentLinks key={c.id} c={c} />
      ) : activeTab === "reports" ? (
        <Reports key={c.id} classId={c.id} />
      ) : activeTab === "logs" ? (
        <Logs key={c.id} classId={c.id} />
      ) : (
        <Denied title="Page not found" />
      )}
    </>
  );
}
function ClassOverview({ c, root }: { c: SchoolClass; root: string }) {
  const { db } = useStore();
  const students = db.students.filter((s) => s.classId === c.id);
  return (
    <>
      <div className="metrics three">
        {[
          { n: students.length, t: "Students in this class", Icon: Users },
          {
            n: students.filter((s) => s.guardianLinkStatus === "verified")
              .length,
            t: "Verified guardian links",
            Icon: ShieldCheck,
          },
          {
            n: db.exams.filter((e) => e.classId === c.id).length,
            t: "Class assessments",
            Icon: BookOpen,
          },
        ].map((x) => (
          <Card key={x.t}>
            <x.Icon />
            <strong className="metric-number">{x.n}</strong>
            <p>{x.t}</p>
          </Card>
        ))}
      </div>
      <div className="dashboard-bottom">
        <Card>
          <h2>A good day to move learning forward.</h2>
          <p>
            Record an assessment, review parent links, or share a little
            progress home.
          </p>
          <div className="quick-actions">
            <Link className="btn secondary" to={`${root}/attendance`}>
              Daily attendance
            </Link>
            <Link className="btn secondary" to={`${root}/notices`}>
              Notice or private note
            </Link>
            <Link className="btn" to={`${root}/marks`}>
              Enter marks <ArrowUpRight size={16} />
            </Link>
            <Link className="btn secondary" to={`${root}/parents`}>
              Review parent links
            </Link>
            <Link className="btn secondary" to={`${root}/reports`}>
              Preview reports
            </Link>
          </div>
        </Card>
        <Card>
          <h2>Latest assessment</h2>
          {db.exams
            .filter((e) => e.classId === c.id)
            .slice(0, 1)
            .map((e) => (
              <div key={e.id}>
                <p>{e.name}</p>
                <Badge>{e.published ? "published" : "draft"}</Badge>
                <p className="muted">{e.date}</p>
              </div>
            ))}
          {!db.exams.some((e) => e.classId === c.id) && (
            <Empty title="Ready for your first exam" />
          )}
        </Card>
      </div>
    </>
  );
}
export function Students({ classId }: { classId?: string }) {
  const { db, update, notify, session } = useStore();
  const [query, setQuery] = useState("");
  const [edit, setEdit] = useState<Student | null | undefined>(undefined);
  const [remove, setRemove] = useState<Student | null>(null);
  const [error, setError] = useState("");
  const allowed = classId
    ? canClass(db, session, classId)
    : session?.role === "school_admin";
  if (!allowed) return <Denied />;
  const students = db.students.filter(
    (s) =>
      (!classId || s.classId === classId) &&
      s.schoolId === db.school.id &&
      (s.name + " " + s.rollNumber).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="section-head section-margin">
        <div>
          <h2>{classId ? "Class roster" : "School students"}</h2>
          <p className="muted">
            Fictional student records · guardian numbers remain masked.
          </p>
        </div>
        <Button
          onClick={() => {
            setError("");
            setEdit(null);
          }}
        >
          <Plus size={16} />
          Add student
        </Button>
      </div>
      <label className="search">
        <input
          aria-label="Search students"
          placeholder="Search name or roll number…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <Card>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Roll no.</th>
                <th>Class</th>
                <th>Guardian link</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div className="person">
                      <span className="avatar pale">
                        {s.name
                          .split(" ")
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join("")}
                      </span>
                      <strong>{s.name}</strong>
                    </div>
                  </td>
                  <td>{s.rollNumber}</td>
                  <td>
                    {className(db.classes.find((c) => c.id === s.classId)!)}
                  </td>
                  <td>
                    <Badge>{s.guardianLinkStatus.replace("_", " ")}</Badge>
                  </td>
                  <td>
                    <div className="inline-actions">
                      <button
                        className="icon-btn"
                        aria-label={`Edit ${s.name}`}
                        onClick={() => {
                          setError("");
                          setEdit(s);
                        }}
                      >
                        <PenLine size={17} />
                      </button>
                      <button
                        className="icon-btn danger"
                        aria-label={`Delete ${s.name}`}
                        onClick={() => setRemove(s)}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!students.length && <Empty title="No students found" />}
      </Card>
      {edit !== undefined && (
        <Modal
          title={edit ? "Edit student" : "Add student"}
          onClose={() => setEdit(undefined)}
        >
          <Form
            fields={[
              { name: "name", label: "Student full name", value: edit?.name },
              {
                name: "roll",
                label: "Roll / admission number",
                value: edit?.rollNumber,
              },
              ...(!classId
                ? [
                    {
                      name: "classId",
                      label: "Class",
                      value: edit?.classId,
                      options: db.classes.map((c) => ({
                        value: c.id,
                        label: className(c),
                      })),
                    },
                  ]
                : []),
            ]}
            onSubmit={(v) => {
              const target = classId || v.classId;
              if (!canClass(db, session, target)) return;
              if (
                db.students.some(
                  (s) =>
                    s.id !== edit?.id &&
                    s.classId === target &&
                    s.rollNumber === v.roll.trim(),
                )
              ) {
                setError(
                  "This roll number is already used in the selected class.",
                );
                return;
              }
              update((d) => {
                if (edit)
                  Object.assign(d.students.find((s) => s.id === edit.id)!, {
                    name: v.name.trim(),
                    rollNumber: v.roll.trim(),
                    classId: target,
                  });
                else
                  d.students.push({
                    id: crypto.randomUUID(),
                    schoolId: d.school.id,
                    classId: target,
                    name: v.name.trim(),
                    rollNumber: v.roll.trim(),
                    guardianLinkStatus: "not_submitted",
                  });
              });
              setEdit(undefined);
              notify("Student saved");
            }}
          >
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </Form>
        </Modal>
      )}
      {remove && (
        <Modal title={`Delete ${remove.name}?`} onClose={() => setRemove(null)}>
          <p>
            The demo student and their linked marks, invitations and report logs
            will be removed.
          </p>
          <Button
            onClick={() => {
              if (!canClass(db, session, remove.classId)) return;
              update((d) => {
                d.students = d.students.filter((s) => s.id !== remove.id);
                d.marks = d.marks.filter((m) => m.studentId !== remove.id);
                d.logs = d.logs.filter((l) => l.studentId !== remove.id);
                d.invites = d.invites.filter((i) => i.studentId !== remove.id);
                d.attendance = d.attendance.filter(
                  (a) => a.studentId !== remove.id,
                );
                d.notices = d.notices.filter((n) => n.studentId !== remove.id);
                const threads = d.conversations
                  .filter((t) => t.studentId === remove.id)
                  .map((t) => t.id);
                d.conversations = d.conversations.filter(
                  (t) => t.studentId !== remove.id,
                );
                d.messages = d.messages.filter(
                  (m) => !threads.includes(m.conversationId),
                );
                d.leaveRequests = d.leaveRequests.filter(
                  (r) => r.studentId !== remove.id,
                );
                d.diary.forEach((entry) => {
                  entry.completedStudentIds = entry.completedStudentIds.filter(
                    (id) => id !== remove.id,
                  );
                });
                d.guardians.forEach(
                  (g) =>
                    (g.linkedStudentIds = g.linkedStudentIds.filter(
                      (id) => id !== remove.id,
                    )),
                );
              });
              setRemove(null);
              notify("Demo student deleted");
            }}
          >
            Delete student
          </Button>
        </Modal>
      )}
    </>
  );
}
export function Exams({ classId, root }: { classId?: string; root?: string }) {
  const { db, session, update, notify } = useStore();
  const [create, setCreate] = useState(false);
  const [error, setError] = useState("");
  const exams = db.exams.filter((e) => !classId || e.classId === classId);
  return (
    <>
      <div className="section-head section-margin">
        <div>
          <h2>Assessments that tell a story.</h2>
          <p className="muted">
            Create exams, record marks, and publish complete results.
          </p>
        </div>
        <Button onClick={() => setCreate(true)}>
          <Plus size={17} />
          Create exam
        </Button>
      </div>
      <Card>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Assessment</th>
                <th>Class</th>
                <th>Date</th>
                <th>Subjects</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {exams.map((e) => (
                <tr key={e.id}>
                  <td>
                    <strong>{e.name}</strong>
                  </td>
                  <td>
                    {className(db.classes.find((c) => c.id === e.classId)!)}
                  </td>
                  <td>{e.date}</td>
                  <td>
                    {e.subjects
                      .map((s) => `${s.name} / ${s.maximumMarks}`)
                      .join(" · ")}
                  </td>
                  <td>
                    <Badge>{e.published ? "published" : "draft"}</Badge>
                  </td>
                  <td>
                    <Link
                      className="text-link"
                      to={
                        root
                          ? `${root}/exams/${e.id}/marks`
                          : `/admin/classes/${e.classId}/exams/${e.id}/marks`
                      }
                    >
                      Enter marks →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!exams.length && <Empty title="No exams yet" />}
      </Card>
      {create && (
        <Modal title="Create assessment" onClose={() => setCreate(false)}>
          <Form
            fields={[
              { name: "name", label: "Exam name" },
              {
                name: "date",
                label: "Exam date",
                type: "date",
                value: "2026-11-15",
              },
              ...(!classId
                ? [
                    {
                      name: "classId",
                      label: "Class",
                      options: db.classes.map((c) => ({
                        value: c.id,
                        label: className(c),
                      })),
                    },
                  ]
                : []),
              {
                name: "subjects",
                label: "Subjects, separated by commas",
                value: "Mathematics, English, Science",
              },
              {
                name: "maxima",
                label: "Maximum marks for each subject, separated by commas",
                value: "100, 100, 100",
              },
            ]}
            label="Create exam"
            onSubmit={(v) => {
              const cid = classId || v.classId;
              if (!canClass(db, session, cid)) return;
              const names = v.subjects.split(",").map((s) => s.trim());
              const maxima = v.maxima.split(",").map(Number);
              if (
                names.some((n) => !n) ||
                new Set(names.map((n) => n.toLowerCase())).size !==
                  names.length ||
                maxima.length !== names.length ||
                maxima.some((n) => !Number.isFinite(n) || n <= 0)
              ) {
                setError(
                  "Use unique subjects and one positive maximum for each subject.",
                );
                return;
              }
              update((d) =>
                d.exams.push({
                  id: crypto.randomUUID(),
                  schoolId: d.school.id,
                  classId: cid,
                  name: v.name,
                  date: v.date,
                  subjects: names.map((name, i) => ({
                    id: crypto.randomUUID(),
                    name,
                    maximumMarks: maxima[i],
                  })),
                  published: false,
                }),
              );
              setCreate(false);
              notify("Draft exam created");
            }}
          >
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </Form>
        </Modal>
      )}
    </>
  );
}
export function Marks({
  classId,
  examId,
}: {
  classId: string;
  examId?: string;
}) {
  const { db, update, session, notify } = useStore();
  const navigate = useNavigate();
  const exams = db.exams.filter((e) => e.classId === classId);
  const [selected, setSelected] = useState(examId || exams[0]?.id || "");
  const e = exams.find((e) => e.id === (examId || selected));
  const [values, setValues] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const students = db.students.filter((s) => s.classId === classId);
  useEffect(() => {
    const map: Record<string, string> = {};
    if (e)
      for (const s of students)
        for (const sub of e.subjects) {
          const m = db.marks.find(
            (m) =>
              m.examId === e.id &&
              m.studentId === s.id &&
              m.subjectId === sub.id,
          );
          map[s.id + ":" + sub.id] =
            m?.obtained === null || m?.obtained === undefined
              ? ""
              : String(m.obtained);
        }
    const cached = sessionStorage.getItem("pr-draft-" + e?.id);
    setValues(cached ? JSON.parse(cached) : map);
    setDirty(!!cached);
    setSubmitted(false);
    setError("");
  }, [e?.id]);
  useEffect(() => {
    const before = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty]);
  if (!e) return <Empty title="Create an exam first" />;
  const invalid = (s: Student, sub: Exam["subjects"][number]) => {
    const v = values[s.id + ":" + sub.id] ?? "";
    return v === ""
      ? "Required"
      : !Number.isFinite(Number(v)) ||
          Number(v) < 0 ||
          Number(v) > sub.maximumMarks
        ? `Use 0–${sub.maximumMarks}`
        : "";
  };
  const errors = students
    .flatMap((s) => e.subjects.map((sub) => invalid(s, sub)))
    .filter(Boolean);
  return (
    <>
      <div className="toolbar">
        <label>
          Assessment
          <select
            aria-label="Select marks exam"
            value={e.id}
            onChange={(event) => {
              setSelected(event.target.value);
              if (examId)
                navigate(`${location.pathname.split("/exams/")[0]}/marks`);
            }}
            disabled={!!examId}
          >
            {exams.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <Badge>
          {dirty ? "unsaved changes" : e.published ? "published" : "draft"}
        </Badge>
      </div>
      <Card>
        <div className="section-head">
          <div>
            <h2>{e.name}</h2>
            <p className="muted">
              All fields required · per-subject maximums enforced
            </p>
          </div>
          <Button
            onClick={() => {
              setSubmitted(true);
              if (!canClass(db, session, classId)) return;
              if (errors.length) {
                setError(
                  `${errors.length} marks need attention. Correct the highlighted cells.`,
                );
                return;
              }
              update((d) => {
                d.marks = d.marks.filter((m) => m.examId !== e.id);
                students.forEach((s) =>
                  e.subjects.forEach((sub) =>
                    d.marks.push({
                      examId: e.id,
                      studentId: s.id,
                      subjectId: sub.id,
                      obtained: Number(values[s.id + ":" + sub.id]),
                    }),
                  ),
                );
                d.exams.find((x) => x.id === e.id)!.published = false;
              });
              sessionStorage.removeItem("pr-draft-" + e.id);
              setDirty(false);
              setError("");
              notify("Marks saved. Review and publish to share with parents.");
            }}
          >
            Save marks
          </Button>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="table-wrap">
          <table className="marks-table">
            <thead>
              <tr>
                <th>Student</th>
                {e.subjects.map((sub) => (
                  <th key={sub.id}>
                    {sub.name}
                    <small>out of {sub.maximumMarks}</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.name}</strong>
                    <small>Roll {s.rollNumber}</small>
                  </td>
                  {e.subjects.map((sub) => (
                    <td key={sub.id}>
                      <input
                        aria-label={`${s.name} ${sub.name}`}
                        aria-invalid={submitted && !!invalid(s, sub)}
                        type="number"
                        min={0}
                        max={sub.maximumMarks}
                        value={values[s.id + ":" + sub.id] ?? ""}
                        onChange={(ev) => {
                          const next = {
                            ...values,
                            [s.id + ":" + sub.id]: ev.target.value,
                          };
                          setValues(next);
                          setDirty(true);
                          sessionStorage.setItem(
                            "pr-draft-" + e.id,
                            JSON.stringify(next),
                          );
                        }}
                      />
                      {submitted && invalid(s, sub) && (
                        <small className="error">{invalid(s, sub)}</small>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!students.length && (
          <Empty title="Add students before entering marks" />
        )}
      </Card>
      <Card>
        <div className="settings-row">
          <div>
            <h2>
              {e.published ? "Published for parents" : "Ready to publish?"}
            </h2>
            <p>
              Publishing makes complete reports visible only to verified, linked
              parents.
            </p>
          </div>
          <Button
            disabled={
              dirty ||
              !students.length ||
              students.some((s) => !score(db, e, s).complete)
            }
            onClick={() => {
              if (!canClass(db, session, classId)) return;
              update((d) => {
                d.exams.find((x) => x.id === e.id)!.published = !e.published;
              });
              notify(
                e.published
                  ? "Exam returned to draft"
                  : "Assessment published to linked parents",
              );
            }}
          >
            {e.published ? "Unpublish exam" : "Publish assessment"}
          </Button>
        </div>
      </Card>
    </>
  );
}
function ParentLinks({ c }: { c: SchoolClass }) {
  const { db, update, session, notify } = useStore();
  const [invite, setInvite] = useState("");
  const students = db.students.filter((s) => s.classId === c.id);
  return (
    <>
      <Card className="invite-card">
        <ShieldCheck size={34} />
        <div>
          <h2>Their number. Their permission.</h2>
          <p>
            Students submit a guardian contact. The guardian separately verifies
            and opts in.
          </p>
          <Button
            disabled={c.status !== "active"}
            onClick={() => {
              if (!canClass(db, session, c.id) || c.status !== "active") return;
              const token = crypto.randomUUID();
              update((d) =>
                d.invites.push({
                  token,
                  classId: c.id,
                  expiresAt: Date.now() + 86400000,
                  attempts: 0,
                }),
              );
              setInvite(`/join/${token}`);
              notify("Class invite created · expires in 24 hours");
            }}
          >
            Generate class onboarding link
          </Button>
        </div>
      </Card>
      {invite && (
        <Card>
          <h3>Private class invitation · expires in 24 hours</h3>
          <div className="invite-url">
            <code>{location.origin + invite}</code>
            <Button
              secondary
              onClick={() =>
                navigator.clipboard
                  .writeText(location.origin + invite)
                  .then(() => notify("Invite copied"))
                  .catch(() =>
                    notify("Copy unavailable. Select the invitation URL."),
                  )
              }
            >
              <Copy size={16} />
              Copy
            </Button>
            <Link className="btn" to={invite}>
              Open student form →
            </Link>
          </div>
          <p className="helper">
            Share privately with your class. No student account required.
          </p>
        </Card>
      )}
      <Card>
        <h2>Guardian linking status</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Status</th>
                <th>Guardian contact</th>
                <th>Consent</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => {
                const g = db.guardians.find((g) => g.id === s.guardianId);
                return (
                  <tr key={s.id}>
                    <td>
                      {s.name}
                      <small>Roll {s.rollNumber}</small>
                    </td>
                    <td>
                      <Badge>{s.guardianLinkStatus.replace("_", " ")}</Badge>
                    </td>
                    <td>{g?.phoneMasked || "Not available"}</td>
                    <td>
                      {g?.consentedAt
                        ? `Recorded ${new Date(g.consentedAt).toLocaleDateString("en-PK")}`
                        : "Not recorded"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
