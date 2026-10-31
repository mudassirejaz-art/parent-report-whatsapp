import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowUpRight,
  Printer,
  HeartHandshake,
  ShieldCheck,
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
import { className, ownChild, score } from "./services";
import { ReportCard } from "./reports";
import { ParentLifeHighlights } from "./school-life-ui";

export function ParentDashboard() {
  const { db, session } = useStore();
  const children = db.students.filter((s) => ownChild(db, session, s.id));
  return (
    <>
      <PageTitle
        eyebrow="A LITTLE CLOSER TO THEIR LEARNING"
        title="Your child, at a glance."
        description={`Your child’s school day and learning story at ${db.school.name}.`}
      />
      {children.map((s) => {
        const c = db.classes.find((c) => c.id === s.classId)!;
        const exams = db.exams.filter(
          (e) => e.classId === c.id && e.published && score(db, e, s).complete,
        );
        const latest = exams
          .slice()
          .sort((a, b) => b.date.localeCompare(a.date))[0];
        return (
          <Card key={s.id} className="child-card">
            <div className="section-head">
              <div className="person">
                <span className="avatar large">
                  {s.name
                    .split(" ")
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <div>
                  <h2>{s.name}</h2>
                  <p>
                    {className(c)} · Roll {s.rollNumber}
                  </p>
                </div>
              </div>
              <Badge>verified link</Badge>
            </div>
            {latest ? (
              <>
                <div className="parent-score">
                  <div>
                    <small>LATEST ASSESSMENT</small>
                    <h3>{latest.name}</h3>
                    <p>{latest.date}</p>
                  </div>
                  <strong>
                    {Math.round(
                      (score(db, latest, s).total / score(db, latest, s).max) *
                        100,
                    )}
                    <span>%</span>
                  </strong>
                </div>
                <Link
                  className="btn"
                  to={`/parent/children/${s.id}/reports/${latest.id}`}
                >
                  View progress report <ArrowUpRight size={17} />
                </Link>
              </>
            ) : (
              <Empty title="Their next chapter is on its way">
                Published reports will appear here after the teacher completes
                the assessment.
              </Empty>
            )}
            <Link className="text-link" to={`/parent/children/${s.id}`}>
              All results & report history →
            </Link>
          </Card>
        );
      })}
      <div className="parent-essentials">
        <Link className="btn secondary" to="/parent/attendance">
          Attendance
        </Link>
        <Link className="btn secondary" to="/parent/diary">
          Homework diary
        </Link>
        <Link className="btn secondary" to="/parent/leave-requests">
          Leave requests
        </Link>
      </div>
      <ParentLifeHighlights />
      {!children.length && (
        <Empty title="No verified children linked">
          Complete your guardian verification and consent, or ask your school to
          review the link.
        </Empty>
      )}
    </>
  );
}
export function ParentChild() {
  const { studentId = "", examId } = useParams();
  const { db, session } = useStore();
  if (!ownChild(db, session, studentId))
    return (
      <Denied
        title="Not authorized"
        message="This child is not linked to your verified parent account."
      />
    );
  const s = db.students.find((s) => s.id === studentId)!;
  const exams = db.exams
    .filter(
      (e) => e.classId === s.classId && e.published && score(db, e, s).complete,
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  if (examId) {
    const e = exams.find((e) => e.id === examId);
    if (!e)
      return (
        <Denied
          title="Report unavailable"
          message="This assessment is unpublished or does not belong to your child."
        />
      );
    return (
      <>
        <div className="section-head section-margin">
          <Link className="text-link" to={`/parent/children/${s.id}`}>
            ← Report history
          </Link>
          <Button secondary onClick={() => window.print()}>
            <Printer size={16} />
            Print / save sample PDF
          </Button>
        </div>
        <ReportCard student={s} exam={e} />
        <Card>
          <h3>Report notification</h3>
          <p>
            {db.logs
              .filter((l) => l.studentId === s.id && l.examId === e.id)
              .map((l) => `Simulated ${l.status}`)
              .join(" · ") || "No notification simulation yet"}
          </p>
          <small>Demo history only. No WhatsApp messages were sent.</small>
        </Card>
      </>
    );
  }
  return (
    <>
      <PageTitle
        eyebrow="YOUR CHILD’S LEARNING STORY"
        title={s.name}
        description={`${className(db.classes.find((c) => c.id === s.classId)!)} · ${db.school.name}`}
      />
      <Card>
        <h2>Progress over time</h2>
        <p className="muted">Based on published assessments for your child.</p>
        <div className="trend">
          {exams
            .slice()
            .reverse()
            .map((e) => (
              <div key={e.id}>
                <strong>
                  {Math.round(
                    (score(db, e, s).total / score(db, e, s).max) * 100,
                  )}
                  %
                </strong>
                <div className="trend-bar">
                  <i
                    style={{
                      height: `${(score(db, e, s).total / score(db, e, s).max) * 100}%`,
                    }}
                  />
                </div>
                <small>{e.name}</small>
              </div>
            ))}
        </div>
      </Card>
      <Card>
        <h2>Report history</h2>
        {exams.map((e) => (
          <Link
            className="history-row"
            key={e.id}
            to={`/parent/children/${s.id}/reports/${e.id}`}
          >
            <div>
              <strong>{e.name}</strong>
              <p>
                {e.date} · {e.subjects.length} subjects
              </p>
            </div>
            <Badge>published</Badge>
            <ArrowUpRight size={20} />
          </Link>
        ))}
        {!exams.length && <Empty title="No published results yet" />}
      </Card>
    </>
  );
}
export function ParentSettings() {
  const { db, session, update, notify } = useStore();
  const [modal, setModal] = useState(false);
  const nav = useNavigate();
  const g = db.guardians.find((g) => g.id === session?.id);
  if (!g) return <Denied />;
  return (
    <>
      <PageTitle
        title="Your profile. Your choice."
        description="Manage your progress-report consent and contact verification."
      />
      <Card>
        <h2>{g.name}</h2>
        <p>{g.phoneMasked}</p>
        <Badge>
          {g.phoneVerified ? "number verified" : "verification pending"}
        </Badge>
        <p>
          {g.consentedAt
            ? "Consent recorded " +
              new Date(g.consentedAt).toLocaleString("en-PK")
            : "Messaging consent not recorded"}
        </p>
        <Form
          fields={[{ name: "name", label: "Display name", value: g.name }]}
          onSubmit={(v) => {
            update((d) => {
              d.guardians.find((x) => x.id === g.id)!.name = v.name;
            });
            notify("Profile updated");
          }}
        />
      </Card>
      <Card>
        <h2>Messaging consent</h2>
        <p>
          You can withdraw consent. This demo will remove report eligibility and
          private report access until you verify and opt in again.
        </p>
        <Button secondary onClick={() => setModal(true)}>
          Change number / review consent
        </Button>
      </Card>
      <Card>
        <h2>Your school</h2>
        <p>
          <strong>{db.school.name}</strong>
        </p>
        <p className="muted">
          {db.school.tagline || "School & home, connected."}
        </p>
        <p>{db.school.address || db.school.city}</p>
        <p className="helper">
          School contact: {db.school.contactEmail || "school@example.test"} ·
          demo profile information
        </p>
      </Card>
      {modal && (
        <Modal
          title="Review guardian verification"
          onClose={() => setModal(false)}
        >
          <p>
            To change a contact, we first remove the existing verification and
            consent, then open a separate guardian contact and verification
            flow. Only one primary guardian is supported in this demo.
          </p>
          <Button
            onClick={() => {
              const sid = g.linkedStudentIds[0];
              const s = db.students.find((s) => s.id === sid);
              if (!s) return;
              if (
                db.classes.find((c) => c.id === s.classId)?.status !== "active"
              ) {
                notify(
                  "Ask your school to reactivate the class before re-verification.",
                );
                return;
              }
              const token = crypto.randomUUID();
              update((d) => {
                const guardian = d.guardians.find((x) => x.id === g.id)!;
                guardian.phoneVerified = false;
                guardian.consentedAt = undefined;
                d.students
                  .filter((s) => s.guardianId === g.id)
                  .forEach((s) => {
                    s.guardianLinkStatus = "pending";
                  });
                d.invites.push({
                  token,
                  classId: s.classId,
                  expiresAt: Date.now() + 86400000,
                  studentId: s.id,
                  attempts: 0,
                });
              });
              setModal(false);
              nav(`/join/${token}`);
            }}
          >
            Withdraw consent & start re-verification
          </Button>
          <Button
            secondary
            onClick={() => {
              update((d) => {
                d.guardians.find((x) => x.id === g.id)!.consentedAt = undefined;
                d.students
                  .filter((s) => s.guardianId === g.id)
                  .forEach((s) => {
                    s.guardianLinkStatus = "declined";
                  });
              });
              setModal(false);
              notify("Consent withdrawn. Reports are no longer eligible.");
            }}
          >
            Withdraw consent only
          </Button>
        </Modal>
      )}
    </>
  );
}
