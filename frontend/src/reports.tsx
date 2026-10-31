import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Send, Eye, Printer, ShieldCheck } from "lucide-react";
import { useStore } from "./store";
import {
  Badge,
  Button,
  Card,
  Denied,
  Empty,
  Modal,
  PageTitle,
} from "./components";
import { canClass, className, eligibility, score } from "./services";
import type { Exam, Student } from "./types";
export function ReportCard({
  student,
  exam,
}: {
  student: Student;
  exam: Exam;
}) {
  const { db } = useStore();
  const result = score(db, exam, student);
  return (
    <div className="report-card">
      <div className="report-school">
        <span className="report-logo">
          {db.school.logoUrl ? (
            <img src={db.school.logoUrl} alt={`${db.school.name} logo`} />
          ) : (
            db.school.name
              .split(" ")
              .slice(0, 2)
              .map((n) => n[0])
              .join("")
          )}
        </span>
        <h2>{db.school.name}</h2>
        <p>{db.school.city} · Sample progress report</p>
      </div>
      <div className="report-student">
        <div>
          <small>STUDENT PROGRESS</small>
          <h2>{student.name}</h2>
          <p>
            {className(db.classes.find((c) => c.id === student.classId)!)} ·
            Roll {student.rollNumber}
          </p>
        </div>
        <Badge>{exam.published ? "published" : "draft / unpublished"}</Badge>
      </div>
      <div className="report-result">
        <div>
          <small>{exam.name}</small>
          <strong>
            {result.complete
              ? Math.round((result.total / result.max) * 100) + "%"
              : "Incomplete"}
          </strong>
          <p>
            {result.total} / {result.max} marks · {exam.date}
          </p>
        </div>
        <span className="result-emblem">
          <ShieldCheck size={44} />
        </span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Subject</th>
            <th>Obtained</th>
            <th>Maximum</th>
          </tr>
        </thead>
        <tbody>
          {exam.subjects.map((sub) => (
            <tr key={sub.id}>
              <td>{sub.name}</td>
              <td>
                <strong>
                  {db.marks.find(
                    (m) =>
                      m.examId === exam.id &&
                      m.studentId === student.id &&
                      m.subjectId === sub.id,
                  )?.obtained ?? "—"}
                </strong>
              </td>
              <td>{sub.maximumMarks}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="report-note">
        Every step forward matters.
        <p>
          Discuss this report with your class teacher for learning guidance.
        </p>
      </div>
      <small>Fictional sample report · ParentReport frontend demo</small>
    </div>
  );
}
export function Reports({ classId }: { classId?: string }) {
  const { db, session, update, notify } = useStore();
  const classes = db.classes.filter((c) => !classId || c.id === classId);
  const [cid, setCid] = useState(classId || classes[0]?.id || "");
  const c = db.classes.find((c) => c.id === cid);
  const exams = db.exams.filter((e) => e.classId === cid);
  const [eid, setEid] = useState("");
  const exam = exams.find((e) => e.id === eid) || exams[0];
  const [preview, setPreview] = useState<Student | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  if (!c || !canClass(db, session, c.id)) return <Denied />;
  const students = db.students.filter((s) => s.classId === c.id);
  const statuses = exam
    ? students.map((s) => ({ s, reason: eligibility(db, session, c, exam, s) }))
    : [];
  const eligible = statuses.filter((s) => !s.reason);
  const already =
    exam &&
    db.logs.some(
      (l) =>
        l.classId === c.id &&
        l.examId === exam.id &&
        l.id.startsWith("campaign-"),
    );
  async function send() {
    if (!exam || !c || locked.current || already) return;
    locked.current = true;
    setBusy(true);
    const ids: string[] = [];
    update((d) => {
      const current = d.classes.find((x) => x.id === c.id)!;
      for (const { s } of eligible) {
        if (eligibility(d, session, current, exam, s)) continue;
        const id = "campaign-" + crypto.randomUUID();
        ids.push(id);
        d.logs.push({
          id,
          schoolId: d.school.id,
          classId: c.id,
          examId: exam.id,
          studentId: s.id,
          status: "queued",
          createdAt: new Date().toISOString(),
          isSimulation: true,
        });
      }
    });
    await new Promise((r) => setTimeout(r, 800));
    update((d) => {
      d.logs
        .filter((l) => ids.includes(l.id))
        .forEach((l) => {
          l.status = "sent";
        });
    });
    await new Promise((r) => setTimeout(r, 800));
    update((d) => {
      d.logs
        .filter((l) => ids.includes(l.id))
        .forEach((l, i) => {
          l.status = i % 3 === 2 ? "failed" : "delivered";
          if (l.status === "failed")
            l.failureReason = "Simulated provider failure";
        });
    });
    setBusy(false);
    setConfirm(false);
    notify("Demo simulation complete. No WhatsApp messages were sent.");
    locked.current = false;
  }
  return (
    <>
      {!classId && (
        <PageTitle
          title="Progress, ready to share."
          description="Preview reports and simulate a consent-aware send."
        />
      )}
      <div className="simulation-banner">
        <ShieldCheck size={20} />
        <strong>DEMO — No WhatsApp messages were sent</strong>
        <span>Every delivery status is simulated.</span>
      </div>
      <div className="toolbar">
        {!classId && (
          <label>
            Class
            <select
              aria-label="Report class"
              value={cid}
              onChange={(e) => {
                setCid(e.target.value);
                setEid("");
              }}
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {className(c)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Assessment
          <select
            aria-label="Report exam"
            value={exam?.id || ""}
            onChange={(e) => setEid(e.target.value)}
          >
            {exams.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} · {e.published ? "published" : "draft"}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!exam ? (
        <Empty title="No exams to report yet" />
      ) : (
        <>
          <div className="metrics three">
            <Card>
              <p>Eligible recipients</p>
              <strong className="metric-number">{eligible.length}</strong>
              <small>Verified, consented & complete</small>
            </Card>
            <Card>
              <p>Skipped students</p>
              <strong className="metric-number">
                {statuses.length - eligible.length}
              </strong>
              <small>Reasons shown below</small>
            </Card>
            <Card>
              <p>Sending permission</p>
              <h2>
                {c.sendingEnabled && c.status === "active"
                  ? "Enabled"
                  : "Paused"}
              </h2>
              <small>Controlled by school admin</small>
            </Card>
          </div>
          <Card>
            <div className="section-head">
              <h2>Review before you share</h2>
              <Button
                disabled={!eligible.length || !!already || busy}
                onClick={() => setConfirm(true)}
              >
                <Send size={16} />
                {already
                  ? "Campaign simulated"
                  : `Simulate send · ${eligible.length}`}
              </Button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Readiness</th>
                    <th>Report</th>
                  </tr>
                </thead>
                <tbody>
                  {statuses.map(({ s, reason }) => (
                    <tr key={s.id}>
                      <td>
                        <strong>{s.name}</strong>
                        <small>Roll {s.rollNumber}</small>
                      </td>
                      <td>
                        <Badge>{reason || "eligible"}</Badge>
                      </td>
                      <td>
                        <Button secondary onClick={() => setPreview(s)}>
                          <Eye size={16} />
                          Preview
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!students.length && <Empty title="No students in this class" />}
          </Card>
        </>
      )}
      {preview && exam && (
        <Modal
          title="Report & message preview"
          onClose={() => setPreview(null)}
        >
          <ReportCard student={preview} exam={exam} />
          <div className="message-preview">
            <strong>Simulated WhatsApp message</strong>
            <p>
              {db.school.name}: Dear guardian, {preview.name}’s {exam.name}{" "}
              report is {exam.published ? "ready" : "a draft"}. Score:{" "}
              {score(db, exam, preview).total}/{score(db, exam, preview).max}.
              View securely in your ParentReport portal.
            </p>
            <small>
              DEMO — No WhatsApp messages were sent. No approved template is
              connected.
            </small>
          </div>
          <Button secondary onClick={() => window.print()}>
            <Printer size={16} />
            Print sample
          </Button>
        </Modal>
      )}
      {confirm && exam && (
        <Modal
          title="Confirm simulated campaign"
          onClose={() => {
            if (!busy) setConfirm(false);
          }}
        >
          <div className="simulation-banner">
            DEMO — No WhatsApp messages were sent
          </div>
          <h3>
            {eligible.length} eligible / {statuses.length - eligible.length}{" "}
            skipped
          </h3>
          {Object.entries(
            statuses.reduce<Record<string, number>>((acc, s) => {
              if (s.reason) acc[s.reason] = (acc[s.reason] || 0) + 1;
              return acc;
            }, {}),
          ).map(([reason, n]) => (
            <p key={reason}>
              {reason}: {n}
            </p>
          ))}
          <p>
            Eligible sample reports progress from queued → sent → simulated
            delivered or failed. Each exam can be simulated once.
          </p>
          <Button disabled={busy || !!already} onClick={send}>
            {busy ? "Simulating queue…" : "Confirm demo send"}
          </Button>
        </Modal>
      )}
    </>
  );
}
export function Logs({ classId }: { classId?: string }) {
  const { db, session } = useStore();
  const [filter, setFilter] = useState("all");
  const allowed = db.logs.filter((l) =>
    session?.role === "parent"
      ? db.guardians
          .find((g) => g.id === session.id)
          ?.linkedStudentIds.includes(l.studentId)
      : canClass(db, session, l.classId),
  );
  const logs = allowed.filter(
    (l) =>
      (!classId || l.classId === classId) &&
      (filter === "all" || l.status === filter),
  );
  return (
    <>
      {!classId && (
        <PageTitle
          title="Every report has a story."
          description="A clear record of simulated report activity."
        />
      )}
      <div className="simulation-banner">
        DEMO — No WhatsApp messages were sent · all statuses below are
        simulated.
      </div>
      <div className="toolbar">
        <label>
          Delivery status
          <select
            aria-label="Filter logs"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            {["all", "queued", "sent", "delivered", "read", "failed"].map(
              (s) => (
                <option key={s}>{s}</option>
              ),
            )}
          </select>
        </label>
      </div>
      <Card>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Class / assessment</th>
                <th>Simulated status</th>
                <th>Time</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs
                .slice()
                .reverse()
                .map((l) => (
                  <tr key={l.id}>
                    <td>
                      {db.students.find((s) => s.id === l.studentId)?.name ||
                        "Archived student"}
                    </td>
                    <td>
                      {className(db.classes.find((c) => c.id === l.classId)!)}
                      <small>
                        {db.exams.find((e) => e.id === l.examId)?.name}
                      </small>
                    </td>
                    <td>
                      <Badge>{l.status}</Badge>
                    </td>
                    <td>{new Date(l.createdAt).toLocaleString("en-PK")}</td>
                    <td>{l.failureReason || "Demo simulation"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {!logs.length && <Empty title="No matching message activity" />}
      </Card>
    </>
  );
}
