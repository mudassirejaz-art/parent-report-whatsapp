import { useState } from "react";
import { CalendarDays, Plus } from "lucide-react";
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
import { ScopePicker, useSchoolScope, LocalOnly } from "./school-life-ui";
import { canClass, ownChild } from "./services";
import { accessibleStudents, localDate } from "./school-life-policy";
import type { LeaveRequest } from "./types";
export function LeaveRequests({ classId }: { classId?: string }) {
  const scope = useSchoolScope(classId);
  const { db, session, update, notify } = useStore();
  const { parent, child, currentClass } = scope;
  const [create, setCreate] = useState(false);
  const [review, setReview] = useState<LeaveRequest | null>(null);
  const [error, setError] = useState("");
  if (scope.denied) return <Denied title="Not authorized" />;
  if (parent && !child) return <Empty title="No verified children linked" />;
  const children = accessibleStudents(db, session);
  const rows = db.leaveRequests
    .filter(
      (r) =>
        r.schoolId === db.school.id &&
        (classId ? r.classId === classId : true) &&
        (parent
          ? r.guardianId === session!.id &&
            ownChild(db, session, r.studentId) &&
            r.studentId === child!.id
          : canClass(db, session, r.classId) &&
            (!currentClass || r.classId === currentClass.id)),
    )
    .slice()
    .reverse();
  return (
    <>
      <PageTitle
        eyebrow="A CLEARER WAY TO KEEP SCHOOL INFORMED"
        title={
          parent
            ? "Time away, with school informed."
            : "Leave requests, in one place."
        }
        description={
          parent
            ? "Request leave for your child and follow the teacher’s decision."
            : "Review requests from verified parents. Approval does not automatically change attendance."
        }
        action={
          parent && (
            <Button
              disabled={currentClass?.status !== "active"}
              onClick={() => {
                setError("");
                setCreate(true);
              }}
            >
              <Plus size={16} />
              Request leave
            </Button>
          )
        }
      />
      {!classId && (
        <div className="toolbar">
          <ScopePicker scope={scope} />
        </div>
      )}
      <LocalOnly />
      {rows.map((r) => {
        const student = db.students.find((s) => s.id === r.studentId);
        return (
          <Card key={r.id}>
            <div className="section-head">
              <span className="notice-kind">
                <CalendarDays size={21} />
                <h2>{student?.name || "Archived student"}</h2>
              </span>
              <Badge>{r.status}</Badge>
            </div>
            <p>
              <strong>
                {r.from} → {r.to}
              </strong>
            </p>
            <p className="notice-body">{r.reason}</p>
            {r.response && (
              <div className="review-response">
                <strong>School response</strong>
                <p>{r.response}</p>
              </div>
            )}
            {!parent && r.status === "pending" && (
              <Button
                secondary
                disabled={
                  db.classes.find((c) => c.id === r.classId)?.status !==
                  "active"
                }
                onClick={() => {
                  setError("");
                  setReview(r);
                }}
              >
                Review request
              </Button>
            )}
            {parent && r.status === "pending" && (
              <p className="helper">
                Awaiting teacher review. Attendance will be recorded separately.
              </p>
            )}
          </Card>
        );
      })}
      {!rows.length && (
        <Empty title="No leave requests yet">
          {parent
            ? "If your child needs time away, let their class teacher know here."
            : "Requests from linked parents will appear here."}
        </Empty>
      )}
      {create && (
        <Modal
          title="Request leave for your child"
          onClose={() => setCreate(false)}
        >
          <Form
            fields={[
              {
                name: "studentId",
                label: "Child",
                value: child?.id,
                options: children.map((s) => ({ value: s.id, label: s.name })),
              },
              {
                name: "from",
                label: "First day of leave",
                type: "date",
                value: localDate(),
              },
              {
                name: "to",
                label: "Last day of leave",
                type: "date",
                value: localDate(),
              },
              { name: "reason", label: "Reason for leave", type: "textarea" },
            ]}
            label="Submit leave request"
            onSubmit={(v) => {
              const s = db.students.find((s) => s.id === v.studentId);
              if (
                !s ||
                !ownChild(db, session, s.id) ||
                db.classes.find((c) => c.id === s.classId)?.status !== "active"
              ) {
                setError("Choose your linked child in an active class.");
                return;
              }
              if (v.to < v.from) {
                setError("The last day cannot be before the first day.");
                return;
              }
              if (
                db.leaveRequests.some(
                  (r) =>
                    r.studentId === s.id &&
                    r.status !== "declined" &&
                    v.from <= r.to &&
                    v.to >= r.from,
                )
              ) {
                setError(
                  "A pending or approved request already covers these dates.",
                );
                return;
              }
              update((d) =>
                d.leaveRequests.push({
                  id: crypto.randomUUID(),
                  schoolId: d.school.id,
                  classId: s.classId,
                  studentId: s.id,
                  guardianId: session!.id,
                  from: v.from,
                  to: v.to,
                  reason: v.reason,
                  status: "pending",
                }),
              );
              setCreate(false);
              notify("Leave request submitted in the demo portal");
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
      {review && (
        <Modal title="Review leave request" onClose={() => setReview(null)}>
          <p>
            {db.students.find((s) => s.id === review.studentId)?.name} ·{" "}
            {review.from} to {review.to}
          </p>
          <Form
            fields={[
              {
                name: "decision",
                label: "Decision",
                options: [
                  { value: "approved", label: "Approve leave" },
                  { value: "declined", label: "Decline leave" },
                ],
              },
              {
                name: "response",
                label: "Response to parent",
                type: "textarea",
              },
            ]}
            label="Save leave decision"
            onSubmit={(v) => {
              if (
                !canClass(db, session, review.classId) ||
                db.classes.find((c) => c.id === review.classId)?.status !==
                  "active"
              ) {
                setError("Your class access is unavailable.");
                return;
              }
              update((d) => {
                const row = d.leaveRequests.find((r) => r.id === review.id)!;
                row.status = v.decision as LeaveRequest["status"];
                row.response = v.response;
                row.reviewedBy = session!.id;
              });
              setReview(null);
              notify("Leave decision saved for the linked parent");
            }}
          >
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </Form>
          <p className="helper">
            This decision does not pre-mark attendance. Teachers maintain the
            daily register.
          </p>
        </Modal>
      )}
    </>
  );
}
