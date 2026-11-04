import { useState } from "react";
import { GuardianLinks } from "./onboarding";
import { Link, useParams } from "react-router-dom";
import { Card, Badge, Empty, PageTitle } from "../components";
import {
  api,
  type Actor,
  type SchoolClass,
  type ClassData,
  type ExamData,
  type AttendanceRecord,
  type Teacher,
} from "./api";
import {
  ActionButton,
  RemoteForm,
  RemoteState,
  today,
  useRemote,
} from "./common";

export function ClassesView({ actor }: { actor: Actor }) {
  const remote = useRemote<SchoolClass[]>("/classes");
  const admin = actor.memberships.find((m) => m.role === "school_admin");
  return (
    <>
      <PageTitle
        title={admin ? "Class portals" : "My classes"}
        description="Open a class to manage its students, attendance and assessments."
      />
      <RemoteState {...remote} retry={remote.refresh} />
      <div className="live-grid">
        {remote.data?.map((c) => (
          <Card key={c.id}>
            <div className="live-card-top">
              <span className="live-class-icon">{c.grade}</span>
              <Badge>{c.status}</Badge>
            </div>
            <h2>
              Class {c.grade}-{c.section}
            </h2>
            <p className="muted">{c.academic_year}</p>
            <Link className="btn" to={"/workspace/classes/" + c.id}>
              Open class
            </Link>
          </Card>
        ))}
      </div>
      {!remote.loading && !remote.data?.length && !remote.error && (
        <Empty title="No classes available">
          <p>
            {admin
              ? "Create your first class portal below, then activate it and assign a teacher."
              : "Your school admin can create and assign your class portal."}
          </p>
        </Empty>
      )}
      {admin && (
        <Card>
          <details>
            <summary>Create a class portal</summary>
            <RemoteForm
              key="newclass"
              label="Create class"
              fields={[
                { name: "grade", label: "Grade" },
                { name: "section", label: "Section" },
                {
                  name: "academic_year",
                  label: "Academic year",
                  value: "2026-27",
                },
              ]}
              onSubmit={async (v) => {
                await api("/classes", "POST", {
                  ...v,
                  school_id: admin.school_id,
                  status: "draft",
                  sending_enabled: false,
                });
                remote.refresh();
              }}
            />
          </details>
        </Card>
      )}
    </>
  );
}
export function TeachersView({ actor }: { actor: Actor }) {
  const school = actor.memberships.find((m) => m.role === "school_admin");
  const remote = useRemote<Teacher[]>(
    school ? "/schools/" + school.school_id + "/teachers" : null,
  );
  if (!school) return <Empty title="School admin access required" />;
  return (
    <>
      <PageTitle
        title="Your teaching team"
        description="Create teacher accounts and manage access to your school."
      />
      <RemoteState {...remote} retry={remote.refresh} />
      <div className="live-grid">
        {remote.data?.map((t) => (
          <Card key={t.id}>
            <h2>{t.name}</h2>
            <p>{t.email}</p>
            <Badge>{t.suspended ? "Suspended" : "Active"}</Badge>
            <ActionButton
              secondary
              onAction={async () => {
                await api("/teachers/" + t.id + "/access", "PATCH", {
                  school_id: school.school_id,
                  suspended: !t.suspended,
                });
                remote.refresh();
              }}
            >
              {t.suspended ? "Restore access" : "Suspend access"}
            </ActionButton>
          </Card>
        ))}
      </div>
      <Card>
        <details>
          <summary>Add a teacher</summary>
          <RemoteForm
            label="Create teacher account"
            fields={[
              { name: "name", label: "Teacher name" },
              { name: "email", label: "Teacher email", type: "email" },
              {
                name: "password",
                label: "Initial password · at least 12 characters",
                type: "password",
              },
            ]}
            onSubmit={async (v) => {
              await api("/teachers", "POST", {
                ...v,
                school_id: school.school_id,
              });
              remote.refresh();
            }}
          />
        </details>
      </Card>
    </>
  );
}
export function ClassView({ actor }: { actor: Actor }) {
  const { classId = "" } = useParams();
  const remote = useRemote<ClassData>("/classes/" + classId);
  const [tab, setTab] = useState("Students");
  const c = remote.data?.class;
  const admin = actor.memberships.some(
    (m) => m.role === "school_admin" && m.school_id === c?.school_id,
  );
  const teachers = useRemote<Teacher[]>(
    admin && c ? "/schools/" + c.school_id + "/teachers" : null,
  );
  return (
    <>
      <Link className="text-link" to="/workspace">
        ← All classes
      </Link>
      <RemoteState {...remote} retry={remote.refresh} />
      {remote.data && c && !remote.error && !remote.loading && (
        <>
          <PageTitle
            title={"Class " + c.grade + "-" + c.section}
            description={
              c.academic_year +
              " · " +
              remote.data.students.length +
              " students"
            }
            action={<Badge>{c.status}</Badge>}
          />
          <div className="live-tabs" aria-label="Class tools">
            {[
              "Students",
              "Exams",
              "Attendance",
              "Homework",
              "Parent links",
              ...(admin ? ["Class settings"] : []),
            ].map((x) => (
              <button
                className={tab === x ? "active" : ""}
                key={x}
                onClick={() => setTab(x)}
              >
                {x}
              </button>
            ))}
          </div>
          {tab === "Students" && (
            <>
              <Card>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Roll number</th>
                        <th>Student</th>
                        <th>Admission</th>
                      </tr>
                    </thead>
                    <tbody>
                      {remote.data.students.map((s) => (
                        <tr key={s.enrollment_id}>
                          <td>{s.roll_number}</td>
                          <td>{s.name}</td>
                          <td>{s.admission_number}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!remote.data.students.length && (
                  <p className="muted">Add the first student to this class.</p>
                )}
              </Card>
              <Card>
                <details>
                  <summary>Add a student</summary>
                  <RemoteForm
                    label="Add student"
                    fields={[
                      { name: "name", label: "Student name" },
                      { name: "admission_number", label: "Admission number" },
                      { name: "roll_number", label: "Roll number" },
                    ]}
                    onSubmit={async (v) => {
                      await api("/classes/" + classId + "/students", "POST", v);
                      remote.refresh();
                    }}
                  />
                </details>
              </Card>
            </>
          )}
          {tab === "Exams" && (
            <>
              <div className="live-grid">
                {remote.data.exams.map((e) => (
                  <Card key={e.id}>
                    <Badge>{e.status}</Badge>
                    <h2>{e.name}</h2>
                    <p>{e.exam_date}</p>
                    <Link
                      className="btn"
                      to={"/workspace/classes/" + classId + "/exams/" + e.id}
                    >
                      Open marks
                    </Link>
                  </Card>
                ))}
              </div>
              <Card>
                <details>
                  <summary>Create an assessment</summary>
                  <RemoteForm
                    label="Create exam"
                    fields={[
                      { name: "name", label: "Exam name" },
                      {
                        name: "date",
                        label: "Exam date",
                        type: "date",
                        value: today(),
                      },
                      {
                        name: "subjects",
                        label: "Subjects · one per line, e.g. Mathematics:100",
                        type: "textarea",
                        value: "Mathematics:100\nEnglish:100\nScience:100",
                      },
                    ]}
                    onSubmit={async (v) => {
                      const subjects = v.subjects
                        .split("\n")
                        .filter((x) => x.trim())
                        .map((line) => {
                          const i = line.lastIndexOf(":");
                          return {
                            name: line.slice(0, i).trim(),
                            maximum_marks: Number(line.slice(i + 1)),
                          };
                        });
                      if (
                        subjects.some(
                          (x) =>
                            !x.name ||
                            !Number.isFinite(x.maximum_marks) ||
                            x.maximum_marks <= 0,
                        )
                      )
                        throw Error("Use Subject name:maximum on each line.");
                      await api("/classes/" + classId + "/exams", "POST", {
                        name: v.name,
                        date: v.date,
                        subjects,
                      });
                      remote.refresh();
                    }}
                  />
                </details>
              </Card>
            </>
          )}
          {tab === "Parent links" && <GuardianLinks classId={classId} />}
          {tab === "Attendance" && (
            <AttendanceEditor
              classId={classId}
              students={remote.data.students}
            />
          )}
          {tab === "Homework" && (
            <Card>
              <h2>Set homework</h2>
              <RemoteForm
                label="Publish homework"
                fields={[
                  { name: "subject", label: "Subject" },
                  { name: "title", label: "Task title" },
                  {
                    name: "instructions",
                    label: "Instructions",
                    type: "textarea",
                  },
                  {
                    name: "due_date",
                    label: "Due date",
                    type: "date",
                    value: today(),
                  },
                ]}
                onSubmit={(v) =>
                  api("/classes/" + classId + "/homework", "POST", v)
                }
              />
            </Card>
          )}
          {tab === "Class settings" && admin && (
            <>
              <Card>
                <h2>Portal access</h2>
                <RemoteForm
                  key={c.status + String(c.sending_enabled)}
                  label="Save portal settings"
                  fields={[
                    {
                      name: "status",
                      label: "Portal status",
                      value: c.status,
                      options: ["draft", "active", "inactive"].map((x) => ({
                        label: x,
                        value: x,
                      })),
                    },
                    {
                      name: "sending",
                      label: "Report sending",
                      value: String(c.sending_enabled),
                      options: [
                        { value: "false", label: "Disabled" },
                        { value: "true", label: "Enabled" },
                      ],
                    },
                  ]}
                  onSubmit={async (v) => {
                    await api("/classes/" + classId, "PATCH", {
                      status: v.status,
                      sending_enabled: v.sending === "true",
                    });
                    remote.refresh();
                  }}
                />
              </Card>
              <Card>
                <h2>Assigned teachers</h2>
                <RemoteState {...teachers} retry={teachers.refresh} />
                {teachers.data?.map((t) => (
                  <div className="live-line" key={t.id}>
                    <div>
                      <strong>{t.name}</strong>
                      <p className="muted">
                        {t.suspended
                          ? "Suspended"
                          : t.class_ids.includes(classId)
                            ? "Assigned"
                            : "Not assigned"}
                      </p>
                    </div>
                    {!t.suspended && (
                      <ActionButton
                        secondary
                        onAction={async () => {
                          await api(
                            "/classes/" + classId + "/assignment",
                            "PUT",
                            {
                              teacher_id: t.id,
                              assigned: !t.class_ids.includes(classId),
                            },
                          );
                          teachers.refresh();
                        }}
                      >
                        {t.class_ids.includes(classId)
                          ? "Revoke assignment"
                          : "Assign teacher"}
                      </ActionButton>
                    )}
                  </div>
                ))}
              </Card>
            </>
          )}
        </>
      )}
    </>
  );
}
function AttendanceEditor({
  classId,
  students,
}: {
  classId: string;
  students: ClassData["students"];
}) {
  const [day, setDay] = useState(today);
  const records = useRemote<AttendanceRecord[]>(
    "/classes/" + classId + "/attendance?day=" + day,
  );
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  return (
    <Card>
      <h2>Daily attendance</h2>
      <label className="live-date">
        Attendance date
        <input
          type="date"
          value={day}
          onChange={(e) => {
            setDay(e.target.value);
            setDraft({});
            setSaved(false);
          }}
        />
      </label>
      <RemoteState {...records} retry={records.refresh} />
      {!records.loading && !records.error && (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.enrollment_id}>
                    <td>{s.name}</td>
                    <td>
                      <select
                        aria-label={"Attendance for " + s.name}
                        value={
                          draft[s.enrollment_id] ??
                          records.data?.find(
                            (r) => r.enrollment_id === s.enrollment_id,
                          )?.status ??
                          ""
                        }
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            [s.enrollment_id]: e.target.value,
                          })
                        }
                      >
                        <option value="">Choose status</option>
                        {["present", "absent", "late", "leave"].map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {students.length > 0 && (
            <ActionButton
              onAction={async () => {
                const rows = students.map((s) => ({
                  enrollment_id: s.enrollment_id,
                  status:
                    draft[s.enrollment_id] ??
                    records.data?.find(
                      (r) => r.enrollment_id === s.enrollment_id,
                    )?.status,
                }));
                if (rows.some((r) => !r.status))
                  throw Error("Choose a status for every student.");
                await api("/classes/" + classId + "/attendance", "PUT", {
                  date: day,
                  records: rows,
                });
                records.refresh();
                setDraft({});
                setSaved(true);
              }}
            >
              Save attendance
            </ActionButton>
          )}
        </>
      )}
      {saved && (
        <p className="live-success" role="status">
          Attendance saved.
        </p>
      )}
    </Card>
  );
}
export function ExamView() {
  const { classId = "", examId = "" } = useParams();
  const roster = useRemote<ClassData>("/classes/" + classId);
  const remote = useRemote<ExamData>("/exams/" + examId);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const e = remote.data;
  const matches = e?.exam.class_id === classId;
  const hasDraft = Object.keys(draft).length > 0;
  return (
    <>
      <Link className="text-link" to={"/workspace/classes/" + classId}>
        ← Back to class
      </Link>
      <RemoteState
        loading={remote.loading || roster.loading}
        error={remote.error || roster.error}
        retry={() => {
          remote.refresh();
          roster.refresh();
        }}
      />
      {e &&
        roster.data &&
        !remote.error &&
        !roster.error &&
        !remote.loading &&
        !roster.loading &&
        matches && (
          <>
            <PageTitle
              title={e.exam.name}
              description="Enter every mark, save, then publish the final report cards."
              action={<Badge>{e.exam.status}</Badge>}
            />
            <Card>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Student</th>
                      {e.subjects.map((s) => (
                        <th key={s.id}>
                          {s.name}
                          <small> / {s.maximum_marks}</small>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {roster.data.students.map((student) => (
                      <tr key={student.enrollment_id}>
                        <td>{student.name}</td>
                        {e.subjects.map((subject) => {
                          const key = student.enrollment_id + "/" + subject.id;
                          const value =
                            draft[key] ??
                            e.marks.find(
                              (m) =>
                                m.enrollment_id === student.enrollment_id &&
                                m.subject_id === subject.id,
                            )?.obtained ??
                            "";
                          return (
                            <td key={subject.id}>
                              <input
                                className="live-mark"
                                type="number"
                                min="0"
                                max={subject.maximum_marks}
                                step="0.01"
                                value={value}
                                disabled={e.exam.status === "published"}
                                aria-label={student.name + " " + subject.name}
                                onChange={(event) => {
                                  setDraft({
                                    ...draft,
                                    [key]: event.target.value,
                                  });
                                  setSaved(false);
                                }}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {e.exam.status === "draft" && (
                <div className="live-buttons">
                  <ActionButton
                    onAction={async () => {
                      const marks = roster.data!.students.flatMap((student) =>
                        e.subjects.map((subject) => {
                          const key = student.enrollment_id + "/" + subject.id;
                          const raw =
                            draft[key] ??
                            e.marks.find(
                              (m) =>
                                m.enrollment_id === student.enrollment_id &&
                                m.subject_id === subject.id,
                            )?.obtained ??
                            "";
                          const obtained = raw === "" ? null : Number(raw);
                          if (
                            obtained !== null &&
                            (!Number.isFinite(obtained) ||
                              obtained < 0 ||
                              obtained > subject.maximum_marks)
                          )
                            throw Error(
                              "Marks must be between zero and the subject maximum.",
                            );
                          return {
                            enrollment_id: student.enrollment_id,
                            subject_id: subject.id,
                            obtained,
                          };
                        }),
                      );
                      await api("/exams/" + examId + "/marks", "PUT", {
                        marks,
                      });
                      setDraft({});
                      setSaved(true);
                      remote.refresh();
                    }}
                  >
                    Save marks
                  </ActionButton>
                  <ActionButton
                    secondary
                    onAction={async () => {
                      if (hasDraft)
                        throw Error("Save your marks before publishing.");
                      await api("/exams/" + examId + "/publish", "POST");
                      remote.refresh();
                      return "Reports published. Linked parents can now read them.";
                    }}
                  >
                    Publish reports
                  </ActionButton>
                </div>
              )}
              {hasDraft && <p className="helper">You have unsaved marks.</p>}
              {saved && (
                <p className="live-success" role="status">
                  Marks saved.
                </p>
              )}
            </Card>
            {e.exam.status === "published" && (
              <Card>
                <h2>Reports are published</h2>
                <p>
                  Parents can view their linked child's report. WhatsApp sending
                  remains a simulation.
                </p>
                <Link className="text-link" to="/workspace/reports">
                  View report cards →
                </Link>
                <ActionButton
                  secondary
                  onAction={async () => {
                    const result = await api<{ queued: number }>(
                      "/exams/" + examId + "/simulate-reports",
                      "POST",
                      { idempotency_key: crypto.randomUUID() },
                    );
                    return (
                      "Simulation only: " +
                      result.queued +
                      " eligible reports queued. No WhatsApp messages sent."
                    );
                  }}
                >
                  Simulate WhatsApp queue
                </ActionButton>
              </Card>
            )}
          </>
        )}
      {e && !matches && !remote.loading && (
        <Empty title="This exam does not belong to this class" />
      )}
    </>
  );
}
