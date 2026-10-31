import { useState } from "react";
import { BookOpenCheck, Plus, CheckCircle2 } from "lucide-react";
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
export function HomeworkDiary({ classId }: { classId?: string }) {
  const scope = useSchoolScope(classId);
  const { db, session, update, notify } = useStore();
  const { parent, child, currentClass } = scope;
  const [create, setCreate] = useState(false);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  if (scope.denied) return <Denied title="Not authorized" />;
  if (parent && !child) return <Empty title="No verified children linked" />;
  if (!currentClass) return <Empty title="No accessible class" />;
  const entries = db.diary
    .filter(
      (e) =>
        e.schoolId === db.school.id &&
        e.classId === currentClass.id &&
        (parent
          ? ownChild(db, session, child!.id)
          : canClass(db, session, e.classId)) &&
        (filter === "all" ||
          (filter === "pending" &&
            !e.completedStudentIds.includes(child?.id || "")) ||
          (filter === "complete" &&
            e.completedStudentIds.includes(child?.id || ""))),
    )
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return (
    <>
      <PageTitle
        eyebrow="THE SCHOOL DIARY, WITHOUT THE LOST PAGE"
        title={
          parent ? "A little practice at home." : "Keep the learning going."
        }
        description="Homework, classwork reminders, and parent-checked completion in one simple diary."
        action={
          !parent && (
            <Button
              disabled={currentClass.status !== "active"}
              onClick={() => setCreate(true)}
            >
              <Plus size={16} />
              Add diary task
            </Button>
          )
        }
      />
      <div className="toolbar">
        {!classId && <ScopePicker scope={scope} />}
        {parent && (
          <label>
            Tasks
            <select
              aria-label="Filter homework"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All tasks</option>
              <option value="pending">To do</option>
              <option value="complete">Parent checked</option>
            </select>
          </label>
        )}
      </div>
      <LocalOnly />
      <div className="diary-grid">
        {entries.map((entry) => {
          const complete =
            !!child && entry.completedStudentIds.includes(child.id);
          return (
            <Card key={entry.id} className="diary-card">
              <div className="section-head">
                <span className="notice-kind">
                  <BookOpenCheck size={20} />
                  <strong>{entry.subject}</strong>
                </span>
                <Badge>
                  {parent
                    ? complete
                      ? "parent checked"
                      : "to do"
                    : `${entry.completedStudentIds.filter((id) => db.students.some((s) => s.id === id && s.classId === entry.classId)).length} parent checked`}
                </Badge>
              </div>
              <h2 translate="no">{entry.title}</h2>
              <p className="notice-body">{entry.instructions}</p>
              <p className="notice-meta">
                Due {entry.dueDate} ·{" "}
                {db.teachers.find((t) => t.id === entry.authorId)?.name ||
                  "School administration"}
              </p>
              {parent ? (
                <Button
                  secondary
                  onClick={() => {
                    if (!ownChild(db, session, child!.id)) return;
                    update((d) => {
                      const row = d.diary.find((e) => e.id === entry.id)!;
                      row.completedStudentIds = complete
                        ? row.completedStudentIds.filter(
                            (id) => id !== child!.id,
                          )
                        : [...row.completedStudentIds, child!.id];
                    });
                    notify(
                      complete
                        ? "Task marked as to do"
                        : "Homework checked by parent",
                    );
                  }}
                >
                  <CheckCircle2 size={16} />
                  {complete ? "Mark as to do" : "Mark parent checked"}
                </Button>
              ) : (
                <p className="helper">
                  Completion means parent checked, not teacher graded.
                </p>
              )}
            </Card>
          );
        })}
      </div>
      {!entries.length && <Empty title="No homework tasks here yet" />}
      {create && (
        <Modal title="Add class diary task" onClose={() => setCreate(false)}>
          <Form
            fields={[
              { name: "subject", label: "Subject" },
              { name: "title", label: "Task title" },
              { name: "instructions", label: "Instructions", type: "textarea" },
              { name: "dueDate", label: "Due date", type: "date" },
            ]}
            label="Publish diary task"
            onSubmit={(v) => {
              if (
                !canClass(db, session, currentClass.id) ||
                currentClass.status !== "active"
              ) {
                setError(
                  "Only authorized staff can publish for an active class.",
                );
                return;
              }
              update((d) => {
                d.diary.push({
                  id: crypto.randomUUID(),
                  schoolId: d.school.id,
                  classId: currentClass.id,
                  subject: v.subject,
                  title: v.title,
                  instructions: v.instructions,
                  dueDate: v.dueDate,
                  authorId: session!.id,
                  completedStudentIds: [],
                });
              });
              setCreate(false);
              notify("Diary task published to linked parents");
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
