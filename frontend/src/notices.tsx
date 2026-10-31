import { useState } from "react";
import {
  Megaphone,
  Plus,
  CheckCheck,
  LockKeyhole,
  BookmarkCheck,
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
  type Field,
} from "./components";
import { canReadNotice, canWriteNotice, isAdmin } from "./school-life-policy";
import { ScopePicker, useSchoolScope, LocalOnly } from "./school-life-ui";
import { className } from "./services";
import type { Notice } from "./types";
export function Noticeboard({ classId }: { classId?: string }) {
  const scope = useSchoolScope(classId);
  const { db, session, update, notify } = useStore();
  const { parent, child, currentClass } = scope;
  const [create, setCreate] = useState(false);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  if (scope.denied) return <Denied title="Not authorized" />;
  if (parent && !child) return <Empty title="No verified children linked" />;
  const visible = db.notices
    .filter(
      (n) =>
        canReadNotice(db, session, n) &&
        (!classId || n.audience === "school" || n.classId === classId) &&
        (!parent ||
          n.audience === "school" ||
          (n.audience === "class" && n.classId === child?.classId) ||
          n.studentId === child?.id) &&
        (filter === "all" ||
          (filter === "unread" && !n.acknowledgedBy.includes(session!.id)) ||
          n.audience === filter),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const roster = db.students.filter(
    (s) => s.classId === currentClass?.id && s.schoolId === db.school.id,
  );
  const fields: Field[] = [
    {
      name: "audience",
      label: "Notice audience",
      options: [
        ...(isAdmin(db, session)
          ? [{ value: "school", label: "Entire school" }]
          : []),
        ...(currentClass
          ? [
              {
                value: "class",
                label: `${className(currentClass)} · all linked parents`,
              },
              { value: "student", label: "One student · private family note" },
            ]
          : []),
      ],
    },
    ...(roster.length
      ? [
          {
            name: "studentId",
            label: "Student (used only for private notes)",
            options: roster.map((s) => ({ value: s.id, label: s.name })),
          },
        ]
      : []),
    {
      name: "category",
      label: "Category",
      options: [
        "Announcement",
        "Behaviour",
        "Uniform",
        "Achievement",
        "Reminder",
      ].map((s) => ({ value: s, label: s })),
    },
    { name: "title", label: "Notice title" },
    { name: "body", label: "Notice message", type: "textarea" },
    {
      name: "priority",
      label: "Priority",
      options: [
        { value: "normal", label: "Normal" },
        { value: "important", label: "Important" },
      ],
    },
    {
      name: "publication",
      label: "Publication",
      options: [
        { value: "published", label: "Publish to parent portal (demo)" },
        { value: "draft", label: "Save as draft" },
      ],
    },
  ];
  return (
    <>
      <PageTitle
        eyebrow={
          parent
            ? "SCHOOL UPDATES, CLOSE AT HAND"
            : "NOTICES & PRIVATE FAMILY NOTES"
        }
        title={
          parent ? "A notice you won’t miss." : "Keep every family in the loop."
        }
        description={
          parent
            ? "School announcements, class updates, and notes meant just for your family."
            : "Publish school-wide or class notices, and send respectful, private student notes."
        }
        action={
          !parent && (
            <Button
              disabled={!db.school.active}
              onClick={() => {
                setError("");
                setCreate(true);
              }}
            >
              <Plus size={17} />
              Create notice
            </Button>
          )
        }
      />
      <div className="toolbar">
        {!classId && <ScopePicker scope={scope} />}
        <label>
          Show
          <select
            aria-label="Filter notices"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            {[
              "all",
              "school",
              "class",
              "student",
              ...(parent ? ["unread"] : []),
            ].map((v) => (
              <option value={v} key={v}>
                {v === "student"
                  ? "Private notes"
                  : v === "all"
                    ? "All notices"
                    : v === "unread"
                      ? "Awaiting acknowledgement"
                      : v + " notices"}
              </option>
            ))}
          </select>
        </label>
      </div>
      <LocalOnly />
      <div className="notice-list">
        {visible.map((n) => {
          const own = isAdmin(db, session) || n.authorId === session?.id;
          const canEdit = own && canWriteNotice(db, session, n);
          const read = n.acknowledgedBy.includes(session!.id);
          const student = db.students.find((s) => s.id === n.studentId);
          const author =
            n.authorRole === "school_admin"
              ? "School administration"
              : db.teachers.find((t) => t.id === n.authorId)?.name ||
                "Class teacher";
          return (
            <Card
              key={n.id}
              className={
                "notice-card " +
                (n.audience === "student" ? "private-note" : "")
              }
            >
              <div className="section-head">
                <span className="notice-kind">
                  {n.audience === "student" ? (
                    <LockKeyhole size={19} />
                  ) : (
                    <Megaphone size={19} />
                  )}
                  <strong>
                    {n.audience === "school"
                      ? "School notice"
                      : n.audience === "class"
                        ? className(db.classes.find((c) => c.id === n.classId)!)
                        : `Private · ${student?.name || "Archived student"}`}
                  </strong>
                </span>
                <div className="inline-actions">
                  <Badge>{n.category}</Badge>
                  <Badge>{n.published ? n.priority : "draft"}</Badge>
                </div>
              </div>
              <h2 translate="no">{n.title}</h2>
              <p className="notice-body">{n.body}</p>
              <p className="notice-meta">
                {author} · {new Date(n.createdAt).toLocaleDateString("en-PK")}
                {n.audience === "student"
                  ? " · Visible only to this family and authorized staff"
                  : ""}
              </p>
              <div className="notice-actions">
                {parent ? (
                  <Button
                    secondary
                    disabled={read}
                    onClick={() => {
                      if (!canReadNotice(db, session, n)) return;
                      update((d) => {
                        const row = d.notices.find((x) => x.id === n.id)!;
                        if (!row.acknowledgedBy.includes(session!.id))
                          row.acknowledgedBy.push(session!.id);
                      });
                      notify("Notice acknowledged. Thank you.");
                    }}
                  >
                    {read ? (
                      <CheckCheck size={16} />
                    ) : (
                      <BookmarkCheck size={16} />
                    )}
                    {read ? "Acknowledged" : "Acknowledge notice"}
                  </Button>
                ) : (
                  <span className="helper">
                    {n.acknowledgedBy.length} parent acknowledgement
                    {n.acknowledgedBy.length === 1 ? "" : "s"}
                  </span>
                )}
                {canEdit && (
                  <Button
                    secondary
                    onClick={() => {
                      if (!canWriteNotice(db, session, n)) return;
                      update((d) => {
                        d.notices.find((x) => x.id === n.id)!.published =
                          !n.published;
                      });
                      notify(
                        n.published
                          ? "Notice moved to draft"
                          : "Notice published in parent portal",
                      );
                    }}
                  >
                    {n.published ? "Unpublish" : "Publish notice"}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      {!visible.length && (
        <Empty title="No notices to show">
          School or class updates will appear here when published.
        </Empty>
      )}
      {create && (
        <Modal
          title="Create a notice or private note"
          onClose={() => setCreate(false)}
        >
          <p className="helper">
            Select “One student” for behaviour, uniform, or personal feedback.
            Private notes are never shown to other families.
          </p>
          <Form
            fields={fields}
            label="Save notice"
            onSubmit={(v) => {
              const notice: Notice = {
                id: crypto.randomUUID(),
                schoolId: db.school.id,
                audience: v.audience as Notice["audience"],
                classId: v.audience === "school" ? undefined : currentClass?.id,
                studentId: v.audience === "student" ? v.studentId : undefined,
                category: v.category as Notice["category"],
                title: v.title.trim(),
                body: v.body.trim(),
                priority: v.priority as Notice["priority"],
                authorId: session!.id,
                authorRole: session!.role as Notice["authorRole"],
                createdAt: new Date().toISOString(),
                published: v.publication === "published",
                acknowledgedBy: [],
              };
              if (
                ["Behaviour", "Uniform"].includes(v.category) &&
                v.audience !== "student"
              ) {
                setError(
                  "Behaviour and uniform notes must be private to one student’s family.",
                );
                return;
              }
              if (!canWriteNotice(db, session, notice)) {
                setError("Choose an active class and an authorized audience.");
                return;
              }
              update((d) => {
                if (canWriteNotice(d, session, notice)) d.notices.push(notice);
              });
              setCreate(false);
              notify(
                notice.published
                  ? "Notice published · portal simulation only"
                  : "Notice saved as draft",
              );
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
