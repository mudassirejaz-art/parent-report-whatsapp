import { useEffect, useState, type CSSProperties } from "react";
import { Link, NavLink, Navigate, Route, Routes } from "react-router-dom";
import {
  BookOpen,
  LayoutGrid,
  Users,
  Megaphone,
  FileBarChart,
  HeartHandshake,
  CalendarDays,
  LogOut,
  Settings,
} from "lucide-react";
import { api, setCsrf, type Actor } from "./api";
import { RemoteForm, ActionButton } from "./common";
import { ClassesView, TeachersView, ClassView, ExamView } from "./classes";
import {
  ChildrenView,
  NoticesView,
  ReportsView,
  ReportView,
  SchoolLifeView,
} from "./family";
import { LanguageSwitcher } from "../i18n/LanguageSwitcher";
import "./live.css";
import { SchoolProvider, SchoolSettings, useSchools, logoUrl } from "./school";

export default function ConnectedWorkspace() {
  const [actor, setActor] = useState<Actor | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    api<Actor>("/auth/me", "GET", undefined, controller.signal)
      .then((user) => {
        setCsrf(user.csrf_token);
        setActor(user);
      })
      .catch((e) => {
        if (!controller.signal.aborted && e.status !== 401) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    const expire = () => {
      setActor(null);
      setCsrf("");
      setError("Your session ended. Please sign in again.");
    };
    window.addEventListener("pr-auth-expired", expire);
    return () => {
      controller.abort();
      window.removeEventListener("pr-auth-expired", expire);
    };
  }, []);
  if (loading)
    return (
      <div className="loading" role="status">
        Opening your school workspace…
      </div>
    );
  if (!actor)
    return (
      <main className="live-login">
        <div className="live-login-intro">
          <Link className="brand" to="/">
            <span className="brand-icon">
              <BookOpen />
            </span>
            ParentReport
          </Link>
          <p className="eyebrow">SCHOOL & HOME, CONNECTED</p>
          <h1>
            A simpler school day.
            <br />A closer connection.
          </h1>
          <p>
            One secure space for your classroom, your child's progress and the
            updates that matter.
          </p>
          <div className="live-login-points">
            <span>✓ Class-specific teacher access</span>
            <span>✓ Private parent report cards</span>
            <span>✓ Clear attendance and school notices</span>
          </div>
        </div>
        <section className="card live-login-card">
          <span className="badge">CONNECTED WORKSPACE</span>
          <h2>Sign in to your school</h2>
          <p className="muted">
            Use the account provided by your school administrator.
          </p>
          <RemoteForm
            label="Sign in"
            fields={[
              { name: "email", label: "Email address", type: "email" },
              { name: "password", label: "Password", type: "password" },
            ]}
            onSubmit={async (values) => {
              const user = await api<Actor>("/auth/login", "POST", values);
              setCsrf(user.csrf_token);
              setError("");
              setActor(user);
            }}
          />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <p className="helper">
            Accounts use a password. Parent phone verification and WhatsApp
            delivery are being integrated separately.
          </p>
          <Link className="text-link" to="/">
            Explore the frontend demo →
          </Link>
          <Link className="text-link" to="/school/register">
            New school? Create your workspace →
          </Link>
        </section>
      </main>
    );
  return (
    <Workspace
      key={actor.id}
      actor={actor}
      onLogout={() => {
        setActor(null);
        setCsrf("");
      }}
    />
  );
}
function Workspace({
  actor,
  onLogout,
}: {
  actor: Actor;
  onLogout: () => void;
}) {
  return (
    <SchoolProvider>
      <WorkspaceShell actor={actor} onLogout={onLogout} />
    </SchoolProvider>
  );
}
function WorkspaceShell({
  actor,
  onLogout,
}: {
  actor: Actor;
  onLogout: () => void;
}) {
  const branding = useSchools();
  const school = branding.schools.length === 1 ? branding.schools[0] : null;
  const admin = actor.memberships.some((m) => m.role === "school_admin");
  const parent = actor.memberships.length === 0;
  const nav = [
    {
      to: "/workspace",
      label: parent ? "My children" : "Classes",
      Icon: parent ? HeartHandshake : LayoutGrid,
      end: true,
    },
    ...(admin
      ? [{ to: "/workspace/teachers", label: "Teachers", Icon: Users }]
      : []),
    { to: "/workspace/notices", label: "Notices", Icon: Megaphone },
    { to: "/workspace/reports", label: "Reports", Icon: FileBarChart },
    {
      to: "/workspace/school-life",
      label: parent ? "Homework & leave" : "Leave requests",
      Icon: CalendarDays,
    },
    ...(admin
      ? [
          {
            to: "/workspace/settings",
            label: "School settings",
            Icon: Settings,
          },
        ]
      : []),
  ];
  return (
    <div
      className="live-app"
      style={
        { "--school-accent": school?.accent ?? "#087f75" } as CSSProperties
      }
    >
      <aside className="live-sidebar live-no-print">
        <Link className="brand" to="/workspace">
          <span className="brand-icon">
            {school?.logo_object_key ? (
              <img src={logoUrl(school)} alt={school.name + " logo"} />
            ) : (
              <BookOpen size={23} />
            )}
          </span>
          <span className="live-school-title">
            <strong>{school?.name ?? "ParentReport"}</strong>
            {school && (
              <small>{school.tagline || "Powered by ParentReport"}</small>
            )}
          </span>
        </Link>
        <span className="live-connected">
          <i />
          Connected school data
        </span>
        <nav aria-label="School workspace">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>
              <n.Icon size={19} />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="live-sidebar-foot">
          <p className="muted">School & home, connected.</p>
          <Link className="text-link" to="/">
            Open demo playground
          </Link>
        </div>
      </aside>
      <div className="live-main">
        <header className="live-header live-no-print">
          <div>
            <small className="eyebrow">
              {admin
                ? "School administrator"
                : parent
                  ? "Parent portal"
                  : "Class teacher portal"}
            </small>
            <strong>{actor.name}</strong>
          </div>
          <div className="live-buttons">
            <LanguageSwitcher />
            <ActionButton
              secondary
              onAction={async () => {
                await api("/auth/logout", "POST");
                onLogout();
              }}
            >
              <LogOut size={16} /> Sign out
            </ActionButton>
          </div>
        </header>
        <main className="live-content">
          <Routes>
            <Route
              index
              element={
                parent ? <ChildrenView /> : <ClassesView actor={actor} />
              }
            />
            <Route path="teachers" element={<TeachersView actor={actor} />} />
            <Route path="settings" element={<SchoolSettings actor={actor} />} />
            <Route
              path="classes/:classId"
              element={<ClassView actor={actor} />}
            />
            <Route
              path="classes/:classId/exams/:examId"
              element={<ExamView />}
            />
            <Route path="notices" element={<NoticesView actor={actor} />} />
            <Route path="reports" element={<ReportsView />} />
            <Route path="reports/:reportId" element={<ReportView />} />
            <Route
              path="school-life"
              element={<SchoolLifeView actor={actor} />}
            />
            <Route path="*" element={<Navigate to="/workspace" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
