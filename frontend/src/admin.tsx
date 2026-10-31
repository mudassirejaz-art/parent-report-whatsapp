import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  Plus,
  Users,
  PanelTop,
  ShieldCheck,
  Send,
  ChevronRight,
  GraduationCap,
  Search,
  SlidersHorizontal,
  BookOpen,
} from "lucide-react";
import { useStore } from "./store";
import {
  Badge,
  Button,
  Card,
  Empty,
  Form,
  Modal,
  PageTitle,
  type Field,
} from "./components";
import { className } from "./services";
import { SchoolBranding } from "./branding";
import { Priorities } from "./priorities";
import type { SchoolClass } from "./types";
export function ClassCards({
  classes,
  admin = false,
}: {
  classes: SchoolClass[];
  admin?: boolean;
}) {
  const { db } = useStore();
  return (
    <div className="class-grid">
      {classes.map((c) => {
        const students = db.students.filter((s) => s.classId === c.id);
        const verified = students.filter(
          (s) => s.guardianLinkStatus === "verified",
        ).length;
        return (
          <Card key={c.id} className="class-card">
            <div className="section-head">
              <span className={"class-icon grade" + c.grade}>
                <BookOpen size={23} />
              </span>
              <Badge>{c.status}</Badge>
            </div>
            <Link
              className="class-title"
              to={
                admin
                  ? `/admin/classes/${c.id}`
                  : `/teacher/classes/${c.id}/overview`
              }
            >
              {className(c)}
              <ArrowUpRight size={19} />
            </Link>
            <p className="muted">
              {c.academicYear} ·{" "}
              {db.teachers
                .filter((t) => c.teacherIds.includes(t.id))
                .map((t) => t.name)
                .join(", ") || "No teacher assigned"}
            </p>
            <div className="class-metrics">
              <div>
                <strong>{students.length}</strong>
                <small>Students</small>
              </div>
              <div>
                <strong>
                  {verified}
                  <span> / {students.length}</span>
                </strong>
                <small>Verified guardians</small>
              </div>
            </div>
            <div className="progress">
              <i
                style={{
                  width: `${students.length ? (verified / students.length) * 100 : 0}%`,
                }}
              />
            </div>
            <div className="class-footer">
              <span>
                <i className={c.sendingEnabled ? "dot" : "dot amber"} />
                {c.sendingEnabled
                  ? "Report sending enabled"
                  : "Report sending paused"}
              </span>
              <Link
                aria-label={`Open ${className(c)}`}
                to={
                  admin
                    ? `/admin/classes/${c.id}`
                    : `/teacher/classes/${c.id}/overview`
                }
              >
                <ChevronRight size={18} />
              </Link>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
export function Metrics() {
  const { db } = useStore();
  const stats = [
    {
      label: "Active class portals",
      value: db.classes.filter((c) => c.status === "active").length,
      detail: `${db.classes.length} classes in your school`,
      Icon: PanelTop,
    },
    {
      label: "Students enrolled",
      value: db.students.length,
      detail: "Across all class portals",
      Icon: Users,
    },
    {
      label: "Verified guardians",
      value: db.students.filter((s) => s.guardianLinkStatus === "verified")
        .length,
      detail: "Verified with message consent",
      Icon: ShieldCheck,
    },
    {
      label: "Reports simulated",
      value: db.logs.length,
      detail: "No real WhatsApp messages",
      Icon: Send,
    },
  ];
  return (
    <div className="metrics">
      {stats.map((s) => (
        <Card key={s.label}>
          <div className="section-head">
            <p>{s.label}</p>
            <s.Icon size={19} />
          </div>
          <strong className="metric-number">
            {s.value}
            <span className="metric-tag">DEMO</span>
          </strong>
          <small>{s.detail}</small>
        </Card>
      ))}
    </div>
  );
}
export function AdminDashboard() {
  const { db } = useStore();
  return (
    <>
      <PageTitle
        title="A clearer picture of progress."
        description="Welcome back. Here’s what’s happening at your school."
        action={
          <Link className="btn" to="/admin/classes/new">
            <Plus size={17} />
            Create class portal
          </Link>
        }
      />
      <div className="welcome-banner">
        <div>
          <span className="badge">SCHOOL & HOME, CONNECTED</span>
          <h2>
            Great teaching deserves
            <br />a strong connection home.
          </h2>
          <p>Give every class its own space. Keep every parent in the loop.</p>
          <Link to="/tour">
            See ParentReport in action <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="banner-illustration">
          <div className="paper paper-back" />
          <div className="paper">
            <ShieldCheck size={28} />
            <strong>
              A little progress.
              <br />A lot of possibility.
            </strong>
            <span>Classroom → Home</span>
            <div className="paper-lines">
              <i />
              <i />
              <i />
            </div>
          </div>
          <span className="round-icon">
            <GraduationCap size={30} />
          </span>
        </div>
      </div>
      <Priorities />
      <Metrics />
      <div className="section-head section-margin">
        <div>
          <h2>Your class portals</h2>
          <p className="muted">Individual classrooms. One connected school.</p>
        </div>
        <Link className="text-link" to="/admin/classes">
          View all classes <ArrowUpRight size={16} />
        </Link>
      </div>
      <ClassCards classes={db.classes} admin />
      <div className="dashboard-bottom">
        <Card>
          <div className="section-head">
            <h2>Recent activity</h2>
            <Link to="/admin/logs" className="text-link">
              All activity →
            </Link>
          </div>
          {db.logs
            .slice(-3)
            .reverse()
            .map((l) => (
              <div className="activity" key={l.id}>
                <span className="activity-icon">
                  <Send size={17} />
                </span>
                <div>
                  <strong>
                    {db.students.find((s) => s.id === l.studentId)?.name ||
                      "Archived student"}{" "}
                    · report simulation
                  </strong>
                  <p>
                    {db.classes.find((c) => c.id === l.classId) &&
                      className(
                        db.classes.find((c) => c.id === l.classId)!,
                      )}{" "}
                    · {new Date(l.createdAt).toLocaleDateString("en-PK")}
                  </p>
                </div>
                <Badge>{l.status}</Badge>
              </div>
            ))}
        </Card>
        <Card className="next-step">
          <span className="class-icon">
            <ShieldCheck />
          </span>
          <h2>
            Parent trust starts
            <br />
            with permission.
          </h2>
          <p>
            A submitted number is only the first step. Parents verify ownership
            and choose to receive reports.
          </p>
          <Link className="text-link" to="/admin/students">
            Review guardian links →
          </Link>
        </Card>
      </div>
    </>
  );
}
export function Classes() {
  const { db, update, notify } = useStore();
  const loc = useLocation();
  const nav = useNavigate();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState<SchoolClass | null>(null);
  const create = loc.pathname.endsWith("/new");
  const fields: Field[] = [
    { name: "grade", label: "Grade / class name", value: editing?.grade },
    { name: "section", label: "Section", value: editing?.section },
    {
      name: "year",
      label: "Academic year",
      value: editing?.academicYear || "2026–27",
    },
    {
      name: "teacher",
      label: "Primary teacher",
      value: editing?.teacherIds[0] || "t1",
      options: db.teachers.map((t) => ({
        value: t.id,
        label: t.name + (t.suspended ? " (suspended)" : ""),
      })),
    },
    {
      name: "status",
      label: "Portal status",
      value: editing?.status || "draft",
      options: ["draft", "active", "inactive"].map((s) => ({
        value: s,
        label: s,
      })),
    },
    {
      name: "sending",
      label: "Report sending",
      value: editing?.sendingEnabled ? "yes" : "no",
      options: [
        { value: "no", label: "Paused" },
        { value: "yes", label: "Enabled" },
      ],
    },
  ];
  return (
    <>
      <PageTitle
        title="A space for every class."
        description="Launch class portals, assign teachers, and stay in control."
        action={
          <Link to="/admin/classes/new" className="btn">
            <Plus size={17} />
            Create class portal
          </Link>
        }
      />
      <div className="toolbar">
        <label className="search">
          <Search size={18} />
          <input
            aria-label="Search classes"
            placeholder="Search class portals…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="filter">
          <SlidersHorizontal size={17} />
          <select
            aria-label="Class status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {["all", "active", "draft", "inactive"].map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "All statuses" : s}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ClassCards
        classes={db.classes.filter(
          (c) =>
            className(c).toLowerCase().includes(query.toLowerCase()) &&
            (status === "all" || status === c.status),
        )}
        admin
      />
      {!db.classes.some(
        (c) =>
          className(c).toLowerCase().includes(query.toLowerCase()) &&
          (status === "all" || status === c.status),
      ) && <Empty title="No matching classes" />}
      <Card className="info-card">
        <ShieldCheck />
        <div>
          <h3>You control access, class by class.</h3>
          <p>
            Deactivating a portal immediately restricts teacher access. Records
            are preserved for history.
          </p>
        </div>
      </Card>
      {(create || editing) && (
        <Modal
          title={editing ? "Edit class portal" : "Create a class portal"}
          onClose={() => {
            setEditing(null);
            nav("/admin/classes");
          }}
        >
          <Form
            fields={fields}
            label={editing ? "Save class" : "Create class portal"}
            onSubmit={(v) => {
              if (
                db.classes.some(
                  (c) =>
                    c.id !== editing?.id &&
                    c.grade.toLowerCase() === v.grade.trim().toLowerCase() &&
                    c.section.toLowerCase() ===
                      v.section.trim().toLowerCase() &&
                    c.academicYear === v.year.trim(),
                )
              ) {
                notify("That class and academic year already exist");
                return;
              }
              update((d) => {
                const c: SchoolClass = {
                  id: editing?.id || crypto.randomUUID(),
                  schoolId: d.school.id,
                  grade: v.grade.trim(),
                  section: v.section.trim().toUpperCase(),
                  academicYear: v.year.trim(),
                  teacherIds: [v.teacher],
                  status: v.status as SchoolClass["status"],
                  sendingEnabled: v.sending === "yes",
                };
                if (editing)
                  d.classes = d.classes.map((x) => (x.id === c.id ? c : x));
                else d.classes.push(c);
              });
              setEditing(null);
              notify("Class portal saved");
              nav("/admin/classes");
            }}
          />
        </Modal>
      )}
    </>
  );
}
export function ClassSettings({ classId }: { classId: string }) {
  const { db, update, notify } = useStore();
  const c = db.classes.find((c) => c.id === classId)!;
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <Card>
        <div className="section-head">
          <div>
            <h2>Portal controls</h2>
            <p className="muted">
              Only the school admin can change these settings.
            </p>
          </div>
          <Badge>{c.status}</Badge>
        </div>
        <div className="settings-row">
          <div>
            <strong>Class portal activation</strong>
            <p>Inactive portals preserve records and block teacher access.</p>
          </div>
          <Button secondary onClick={() => setConfirm(true)}>
            {c.status === "active"
              ? "Deactivate portal"
              : "Launch / activate portal"}
          </Button>
        </div>
        <div className="settings-row">
          <div>
            <strong>Report sending</strong>
            <p>Allow authorized teachers to simulate report sending.</p>
          </div>
          <Button
            secondary
            onClick={() => {
              update((d) => {
                d.classes.find((x) => x.id === c.id)!.sendingEnabled =
                  !c.sendingEnabled;
              });
              notify("Sending permission updated");
            }}
          >
            {c.sendingEnabled ? "Pause sending" : "Enable sending"}
          </Button>
        </div>
        <Form
          fields={[
            { name: "grade", label: "Grade", value: c.grade },
            { name: "section", label: "Section", value: c.section },
            { name: "year", label: "Academic year", value: c.academicYear },
          ]}
          onSubmit={(v) => {
            update((d) =>
              Object.assign(d.classes.find((x) => x.id === c.id)!, {
                grade: v.grade,
                section: v.section,
                academicYear: v.year,
              }),
            );
            notify("Class details updated");
          }}
        />
      </Card>
      <Card>
        <h2>Teacher assignments</h2>
        <p className="muted">
          Grant one or more teachers access. The first assigned teacher is
          primary.
        </p>
        {db.teachers.map((t) => (
          <label className="check-row" key={t.id}>
            <input
              type="checkbox"
              checked={c.teacherIds.includes(t.id)}
              onChange={(e) => {
                const checked = e.target.checked;
                update((d) => {
                  const target = d.classes.find((x) => x.id === c.id)!;
                  target.teacherIds = checked
                    ? [...target.teacherIds, t.id]
                    : target.teacherIds.filter((id) => id !== t.id);
                });
                notify("Teacher access updated");
              }}
            />
            {t.name}
            <Badge>{t.suspended ? "suspended" : "available"}</Badge>
          </label>
        ))}
      </Card>
      {confirm && (
        <Modal
          title={
            c.status === "active"
              ? "Deactivate class portal?"
              : "Activate class portal?"
          }
          onClose={() => setConfirm(false)}
        >
          <p>
            {c.status === "active"
              ? "Teachers will immediately lose access. All records stay available to the school admin."
              : "Assigned teachers can open this class once activated."}
          </p>
          <Button
            onClick={() => {
              update((d) => {
                d.classes.find((x) => x.id === c.id)!.status =
                  c.status === "active" ? "inactive" : "active";
              });
              setConfirm(false);
              notify("Class activation updated");
            }}
          >
            Confirm {c.status === "active" ? "deactivation" : "activation"}
          </Button>
        </Modal>
      )}
    </>
  );
}
export function Teachers() {
  const { db, update, notify } = useStore();
  const [add, setAdd] = useState(false);
  return (
    <>
      <PageTitle
        title="Good teachers. The right access."
        description="Manage your teaching team and class-level permissions."
        action={
          <Button onClick={() => setAdd(true)}>
            <Plus size={17} />
            Add teacher
          </Button>
        }
      />
      <Card>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Teacher</th>
                <th>Assigned portals</th>
                <th>Access</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {db.teachers.map((t) => (
                <tr key={t.id}>
                  <td>
                    <strong>{t.name}</strong>
                    <small>{t.email}</small>
                  </td>
                  <td>
                    {db.classes
                      .filter((c) => c.teacherIds.includes(t.id))
                      .map((c) => (
                        <Link
                          key={c.id}
                          className="badge"
                          to={`/admin/classes/${c.id}`}
                        >
                          {className(c)}
                        </Link>
                      ))}
                  </td>
                  <td>
                    <Badge>{t.suspended ? "suspended" : "active"}</Badge>
                  </td>
                  <td>
                    <Button
                      secondary
                      onClick={() => {
                        update((d) => {
                          d.teachers.find((x) => x.id === t.id)!.suspended =
                            !t.suspended;
                        });
                        notify("Teacher access updated");
                      }}
                    >
                      {t.suspended ? "Restore access" : "Suspend access"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {add && (
        <Modal title="Add a demo teacher" onClose={() => setAdd(false)}>
          <Form
            fields={[
              { name: "name", label: "Teacher name" },
              {
                name: "email",
                label: "Email (use example.test)",
                type: "email",
              },
            ]}
            onSubmit={(v) => {
              if (
                db.teachers.some(
                  (t) => t.email.toLowerCase() === v.email.toLowerCase(),
                )
              ) {
                notify("A teacher with this email already exists");
                return;
              }
              update((d) =>
                d.teachers.push({
                  id: "t" + crypto.randomUUID(),
                  schoolId: d.school.id,
                  name: v.name,
                  email: v.email,
                  suspended: false,
                }),
              );
              setAdd(false);
              notify("Demo teacher added. Assign a class to grant access.");
            }}
          />
        </Modal>
      )}
    </>
  );
}
export function Settings() {
  const { db, update, reset, notify } = useStore();
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <PageTitle
        title="Make it your school."
        description="School identity, workspace access, and demo controls."
      />
      <SchoolBranding />
      <Card>
        <div className="settings-row">
          <div>
            <h2>School workspace</h2>
            <p>
              Suspending blocks teacher and parent access across the school.
            </p>
          </div>
          <Button
            secondary
            onClick={() => {
              update((d) => {
                d.school.active = !d.school.active;
              });
              notify("School access updated");
            }}
          >
            {db.school.active ? "Suspend school" : "Reactivate school"}
          </Button>
        </div>
        <div className="settings-row">
          <div>
            <h2>WhatsApp connection</h2>
            <p>Not connected. This demo uses simulated logs only.</p>
          </div>
          <Badge>simulation only</Badge>
        </div>
      </Card>
      <Card>
        <h2>Start fresh</h2>
        <p>
          Restore all fictional demo records. Changes in this browser will be
          cleared.
        </p>
        <Button secondary onClick={() => setConfirm(true)}>
          Reset demo data
        </Button>
      </Card>
      {confirm && (
        <Modal
          title="Reset fictional demo data?"
          onClose={() => setConfirm(false)}
        >
          <p>
            This clears your sample edits and restores the starting dataset.
          </p>
          <Button
            onClick={() => {
              reset();
              setConfirm(false);
            }}
          >
            Confirm reset
          </Button>
        </Modal>
      )}
    </>
  );
}
