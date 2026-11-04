import { useState } from "react";
import { ParentConsentSettings } from "./onboarding";
import { Link, useParams } from "react-router-dom";
import { Badge, Card, Empty, PageTitle } from "../components";
import {
  api,
  type Actor,
  type Child,
  type Report,
  type Notice,
  type SchoolClass,
  type ClassData,
  type AttendanceRecord,
  type Homework,
  type Leave,
} from "./api";
import {
  ActionButton,
  RemoteForm,
  RemoteState,
  today,
  useRemote,
} from "./common";

export function ReportsView() {
  const remote = useRemote<Report[]>("/reports");
  return (
    <>
      <PageTitle
        title="Published reports"
        description="Final report cards, saved securely by your school."
      />
      <RemoteState {...remote} retry={remote.refresh} />
      <div className="live-grid">
        {remote.data?.map((r) => (
          <Card key={r.id}>
            <p className="eyebrow">{r.snapshot.class_name}</p>
            <h2>{r.snapshot.student_name}</h2>
            <p>{r.snapshot.exam_name}</p>
            <strong className="live-score">
              {r.snapshot.maximum
                ? Math.round(
                    (Number(r.snapshot.total) / Number(r.snapshot.maximum)) *
                      100,
                  )
                : 0}
              %
            </strong>
            <p>{r.snapshot.exam_date}</p>
            <Link className="btn secondary" to={"/workspace/reports/" + r.id}>
              Read report
            </Link>
          </Card>
        ))}
      </div>
      {!remote.loading && !remote.error && !remote.data?.length && (
        <Empty title="Reports will appear after publishing" />
      )}
    </>
  );
}
export function ReportView() {
  const { reportId = "" } = useParams();
  const remote = useRemote<Report>("/reports/" + reportId);
  const s = remote.data?.snapshot;
  return (
    <>
      <Link className="text-link live-no-print" to="/workspace/reports">
        ← All reports
      </Link>
      <RemoteState {...remote} retry={remote.refresh} />
      {s && !remote.error && (
        <Card className="live-report">
          <p className="eyebrow">{s.school_name}</p>
          <h1>{s.student_name}</h1>
          <p>
            {s.class_name} · {s.exam_date}
          </p>
          <h2>{s.exam_name}</h2>
          <p className="live-score">
            {Math.round((Number(s.total) / Number(s.maximum)) * 100)}%
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Marks</th>
                  <th>Maximum</th>
                </tr>
              </thead>
              <tbody>
                {s.subjects.map((sub, i) => (
                  <tr key={i}>
                    <td>{sub.name}</td>
                    <td>{sub.obtained}</td>
                    <td>{sub.maximum}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th>Total</th>
                  <th>{s.total}</th>
                  <th>{s.maximum}</th>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="helper">Published school report · saved version</p>
          <button
            className="btn secondary live-no-print"
            onClick={() => window.print()}
          >
            Print report
          </button>
        </Card>
      )}
    </>
  );
}
export function NoticesView({ actor }: { actor: Actor }) {
  const remote = useRemote<Notice[]>("/notices");
  const classes = useRemote<SchoolClass[]>(
    actor.memberships.length ? "/classes" : null,
  );
  const [audience, setAudience] = useState("class"),
    [classId, setClassId] = useState("");
  const classValue = classId || classes.data?.[0]?.id || "";
  const roster = useRemote<ClassData>(
    classValue && audience === "student" ? "/classes/" + classValue : null,
  );
  const admin = actor.memberships.find((m) => m.role === "school_admin");
  return (
    <>
      <PageTitle
        title="School notices"
        description="Updates from your school and class teacher."
      />
      <RemoteState {...remote} retry={remote.refresh} />
      {actor.memberships.length > 0 && (
        <Card>
          <details>
            <summary>Write a notice</summary>
            <div className="live-two">
              <label>
                Audience
                <select
                  aria-label="Audience"
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                >
                  {admin && <option value="school">Whole school</option>}
                  <option value="class">Class</option>
                  <option value="student">Private student note</option>
                </select>
              </label>
              {audience !== "school" && (
                <label>
                  Class
                  <select
                    aria-label="Class"
                    value={classValue}
                    onChange={(e) => setClassId(e.target.value)}
                  >
                    {classes.data?.map((c) => (
                      <option key={c.id} value={c.id}>
                        Class {c.grade}-{c.section}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            {audience === "student" && (
              <RemoteState {...roster} retry={roster.refresh} />
            )}
            {(audience === "school" || classValue) && (
              <RemoteForm
                key={
                  audience + classValue + (roster.data?.students.length ?? 0)
                }
                label="Publish notice"
                fields={[
                  ...(audience === "student"
                    ? [
                        {
                          name: "enrollment_id",
                          label: "Student",
                          options:
                            roster.data?.students.map((s) => ({
                              value: s.enrollment_id,
                              label: s.name,
                            })) ?? [],
                        },
                      ]
                    : []),
                  {
                    name: "category",
                    label: "Category",
                    options: (audience === "student"
                      ? [
                          "Announcement",
                          "Behaviour",
                          "Uniform",
                          "Achievement",
                          "Reminder",
                        ]
                      : ["Announcement", "Achievement", "Reminder"]
                    ).map((x) => ({ label: x, value: x })),
                  },
                  { name: "title", label: "Notice title" },
                  { name: "body", label: "Notice details", type: "textarea" },
                ]}
                onSubmit={async (v) => {
                  await api("/notices", "POST", {
                    ...v,
                    audience,
                    ...(audience === "school"
                      ? { school_id: admin!.school_id }
                      : { class_id: classValue }),
                    published: true,
                  });
                  remote.refresh();
                }}
              />
            )}
          </details>
        </Card>
      )}
      <div className="live-stack">
        {remote.data?.map((n) => (
          <Card key={n.id}>
            <div className="live-card-top">
              <Badge>{n.category}</Badge>
              <span className="muted">
                {n.audience === "student"
                  ? "Private student note"
                  : n.audience === "class"
                    ? "Class notice"
                    : "School notice"}
              </span>
            </div>
            {!n.published && <Badge>Draft</Badge>}
            <h2>{n.title}</h2>
            <p className="live-preserve">{n.body}</p>
            <small>{new Date(n.created_at).toLocaleDateString()}</small>
            {!actor.memberships.length &&
              (n.acknowledged ? (
                <p className="live-success">Acknowledged</p>
              ) : (
                <ActionButton
                  secondary
                  onAction={async () => {
                    await api("/notices/" + n.id + "/acknowledge", "POST");
                    remote.refresh();
                  }}
                >
                  Acknowledge notice
                </ActionButton>
              ))}
          </Card>
        ))}
      </div>
      {!remote.loading && !remote.error && !remote.data?.length && (
        <Empty title="You're all caught up">
          <p>New school notices will appear here.</p>
        </Empty>
      )}
    </>
  );
}
export function ChildrenView() {
  const children = useRemote<Child[]>("/me/children");
  const reports = useRemote<Report[]>("/reports");
  const [selected, setSelected] = useState("");
  const child =
    children.data?.find((c) => c.id === selected) || children.data?.[0];
  const attendance = useRemote<AttendanceRecord[]>(
    child ? "/me/children/" + child.id + "/attendance" : null,
  );
  return (
    <>
      <PageTitle
        title="Your children"
        description="A clear view of progress, attendance and the school day."
      />
      <RemoteState {...children} retry={children.refresh} />
      {!!children.data?.length && (
        <div className="live-child-picker">
          {children.data.map((c) => (
            <button
              key={c.id}
              className={child?.id === c.id ? "active" : ""}
              onClick={() => setSelected(c.id)}
            >
              <strong>{c.name}</strong>
              <span>
                Class {c.grade}-{c.section}
              </span>
            </button>
          ))}
        </div>
      )}
      {child && (
        <>
          <Card>
            <p className="eyebrow">{child.school_name}</p>
            <h2>{child.name}</h2>
            <p>
              Class {child.grade}-{child.section}
            </p>
            <div className="live-buttons">
              {reports.data
                ?.filter((r) => r.student_id === child.id)
                .map((r) => (
                  <Link
                    className="btn"
                    key={r.id}
                    to={"/workspace/reports/" + r.id}
                  >
                    {r.snapshot.exam_name} →
                  </Link>
                ))}
            </div>
            {!reports.loading &&
              !reports.data?.some((r) => r.student_id === child.id) && (
                <p className="muted">No published reports yet.</p>
              )}
            <RemoteState {...reports} retry={reports.refresh} />
          </Card>
          <Card>
            <h2>Recent attendance</h2>
            <p className="muted">Latest 90 records for {child.name}.</p>
            <RemoteState {...attendance} retry={attendance.refresh} />
            {!!attendance.data?.length && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Teacher note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendance.data.map((a) => (
                      <tr key={a.attendance_date}>
                        <td>{a.attendance_date}</td>
                        <td>
                          <Badge>{a.status}</Badge>
                        </td>
                        <td>{a.note || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!attendance.loading &&
              !attendance.error &&
              !attendance.data?.length && (
                <p>Attendance has not been recorded yet.</p>
              )}
          </Card>
        </>
      )}
      {!children.loading && !children.error && !children.data?.length && (
        <Empty title="No verified child links yet">
          <p>
            Your school must complete guardian verification before a child
            appears here.
          </p>
        </Empty>
      )}
    </>
  );
}
export function SchoolLifeView({ actor }: { actor: Actor }) {
  const homework =
    useRemote<(Homework & { completed_enrollment_ids: string[] })[]>(
      "/homework",
    );
  const leaves = useRemote<Leave[]>("/leave-requests");
  const parent = actor.memberships.length === 0;
  const children = useRemote<Child[]>(parent ? "/me/children" : null);
  return (
    <>
      <PageTitle
        title={parent ? "Homework & leave" : "Leave requests"}
        description={
          parent
            ? "Stay up to date and let your teacher know about planned absence."
            : "Review parent requests. Attendance is recorded separately."
        }
      />
      {parent && (
        <>
          <h2>Homework diary</h2>
          <RemoteState {...homework} retry={homework.refresh} />
          {homework.data?.map((task) => (
            <Card key={task.id}>
              <Badge>{task.subject}</Badge>
              <h2>{task.title}</h2>
              <p className="live-preserve">{task.instructions}</p>
              <p>Due {task.due_date}</p>
              {children.data
                ?.filter((c) => c.class_id === task.class_id)
                .map((c) =>
                  task.completed_enrollment_ids.includes(c.enrollment_id) ? (
                    <p className="live-success" key={c.id}>
                      Checked for {c.name}
                    </p>
                  ) : (
                    <ActionButton
                      key={c.id}
                      secondary
                      onAction={async () => {
                        await api(
                          "/homework/" + task.id + "/complete",
                          "POST",
                          { enrollment_id: c.enrollment_id },
                        );
                        homework.refresh();
                      }}
                    >
                      Mark checked for {c.name}
                    </ActionButton>
                  ),
                )}
            </Card>
          ))}
          {!homework.loading && !homework.data?.length && (
            <p className="muted">No homework has been posted.</p>
          )}
          {!!children.data?.length && (
            <Card>
              <details>
                <summary>Request leave</summary>
                <RemoteForm
                  label="Send leave request"
                  fields={[
                    {
                      name: "enrollment_id",
                      label: "Child",
                      options: children.data.map((c) => ({
                        value: c.enrollment_id,
                        label: c.name,
                      })),
                    },
                    {
                      name: "from_date",
                      label: "From date",
                      type: "date",
                      value: today(),
                    },
                    {
                      name: "to_date",
                      label: "To date",
                      type: "date",
                      value: today(),
                    },
                    {
                      name: "reason",
                      label: "Reason for leave",
                      type: "textarea",
                    },
                  ]}
                  onSubmit={async (v) => {
                    await api("/leave-requests", "POST", v);
                    leaves.refresh();
                  }}
                />
              </details>
            </Card>
          )}
        </>
      )}
      <h2>{parent ? "Your leave requests" : "Parent requests"}</h2>
      {parent && <ParentConsentSettings />}
      <RemoteState {...leaves} retry={leaves.refresh} />
      {leaves.data?.map((leave) => (
        <Card key={leave.id}>
          <Badge>{leave.status}</Badge>
          <h2>{leave.student_name}</h2>
          <p className="muted">{leave.class_name}</p>
          <h3>
            {leave.from_date} — {leave.to_date}
          </h3>
          <p className="live-preserve">{leave.reason}</p>
          {leave.response && <p>Teacher response: {leave.response}</p>}
          {!parent && leave.status === "pending" && (
            <RemoteForm
              label="Save decision"
              fields={[
                {
                  name: "status",
                  label: "Decision",
                  options: [
                    { value: "approved", label: "Approve" },
                    { value: "declined", label: "Decline" },
                  ],
                },
                { name: "response", label: "Response to parent" },
              ]}
              onSubmit={async (v) => {
                await api("/leave-requests/" + leave.id, "PATCH", v);
                leaves.refresh();
              }}
            />
          )}
        </Card>
      ))}
      {!leaves.loading && !leaves.error && !leaves.data?.length && (
        <Empty title="No leave requests" />
      )}
    </>
  );
}
