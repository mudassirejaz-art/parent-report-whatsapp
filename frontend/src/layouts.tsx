import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  BookOpen,
  LayoutDashboard,
  School,
  Users,
  GraduationCap,
  FileBarChart,
  Send,
  Settings,
  PlayCircle,
  LogOut,
  ChevronRight,
  Menu,
  HeartHandshake,
  MessageSquare,
  PanelTop,
  CalendarCheck,
  Megaphone,
  BookOpenCheck,
  CalendarDays,
} from "lucide-react";
import { useState, useEffect, type CSSProperties } from "react";
import { useStore } from "./store";
import { DemoNotice } from "./components";
export function Logo({ school = false }: { school?: boolean }) {
  const { db } = useStore();
  if (school)
    return (
      <Link className="brand school-portal-brand" to="/">
        <span className="brand-icon">
          {db.school.logoUrl ? (
            <img src={db.school.logoUrl} alt={`${db.school.name} logo`} />
          ) : (
            <BookOpen size={23} />
          )}
        </span>
        <span className="school-brand-name">
          {db.school.name}
          <small>{db.school.tagline || "School & home, connected"}</small>
        </span>
      </Link>
    );
  return (
    <Link className="brand" to="/">
      <span className="brand-icon">
        <BookOpen size={23} />
      </span>
      Parent<span>Report</span>
      <i>●</i>
    </Link>
  );
}
export function RoleSwitcher() {
  const { setSession, session } = useStore();
  const nav = useNavigate();
  return (
    <label className="role-switcher">
      <span>Demo Role Switcher</span>
      <select
        aria-label="Demo Role Switcher"
        value={session?.id || ""}
        onChange={(e) => {
          const id = e.target.value;
          setSession({
            id,
            role:
              id === "admin"
                ? "school_admin"
                : id.startsWith("t")
                  ? "class_teacher"
                  : "parent",
          });
          nav(
            id === "admin"
              ? "/admin/dashboard"
              : id.startsWith("t")
                ? "/teacher/dashboard"
                : "/parent/dashboard",
          );
        }}
      >
        <option value="" disabled>
          Choose role
        </option>
        <option value="admin">School Admin</option>
        <option value="t1">Teacher A · Amina</option>
        <option value="t2">Teacher B · Bilal</option>
        <option value="t3">Teacher C · Sara</option>
        <option value="g1">Parent A</option>
        <option value="g2">Parent B</option>
      </select>
    </label>
  );
}
export function Shell() {
  const { db, session, setSession } = useStore();
  const [mobile, setMobile] = useState(false);
  const loc = useLocation();
  const admin = session?.role === "school_admin";
  const parent = session?.role === "parent";
  const nav = useNavigate();
  useEffect(() => {
    document.title = `${db.school.name} · ParentReport`;
    return () => {
      document.title = "ParentReport · School & home, connected";
    };
  }, [db.school.name]);
  const links = parent
    ? [
        ["/parent/dashboard", "My children", HeartHandshake],
        ["/parent/attendance", "Attendance", CalendarCheck],
        ["/parent/notices", "Notices & notes", Megaphone],
        ["/parent/diary", "Homework diary", BookOpenCheck],
        ["/parent/leave-requests", "Leave requests", CalendarDays],
        ["/parent/settings", "Profile & privacy", Settings],
      ]
    : admin
      ? [
          ["/admin/dashboard", "Overview", LayoutDashboard],
          ["/admin/classes", "Class portals", PanelTop],
          ["/admin/teachers", "Teachers & access", GraduationCap],
          ["/admin/students", "Students", Users],
          ["/admin/attendance", "Attendance", CalendarCheck],
          ["/admin/notices", "Notices & notes", Megaphone],
          ["/admin/diary", "Homework diary", BookOpenCheck],
          ["/admin/leave-requests", "Leave requests", CalendarDays],
          ["/admin/exams", "Exams", FileBarChart],
          ["/admin/reports", "Reports", Send],
          ["/admin/logs", "Message logs", MessageSquare],
          ["/admin/settings", "School settings", Settings],
        ]
      : [
          ["/teacher/dashboard", "My classes", LayoutDashboard],
          ["/teacher/notices", "School & class notices", Megaphone],
        ];
  const primaryPaths = parent
    ? ["/parent/dashboard", "/parent/notices", "/parent/attendance"]
    : admin
      ? [
          "/admin/dashboard",
          "/admin/classes",
          "/admin/teachers",
          "/admin/notices",
          "/admin/attendance",
        ]
      : links.map((item) => String(item[0]));
  function navigation(items: typeof links) {
    return items.map(([path, label, Icon]) => {
      const I = Icon as typeof School;
      return (
        <NavLink
          key={String(path)}
          to={String(path)}
          onClick={() => setMobile(false)}
        >
          <I size={19} />
          {String(label)}
        </NavLink>
      );
    });
  }
  return (
    <div
      className={parent ? "app parent-app" : "app"}
      style={
        { "--portal-accent": db.school.accent || "#087f75" } as CSSProperties
      }
    >
      <aside className={mobile ? "sidebar open" : "sidebar"}>
        <Logo school />
        <div className="school-switch">
          <span className="school-monogram">
            {db.school.logoUrl ? (
              <img src={db.school.logoUrl} alt="School logo" />
            ) : (
              db.school.name
                .split(" ")
                .slice(0, 2)
                .map((n) => n[0])
                .join("")
            )}
          </span>
          <div>
            <strong>{db.school.name}</strong>
            <small>{db.school.city} · Demo school</small>
          </div>
        </div>
        <p className="nav-label">
          {parent
            ? "FAMILY SPACE"
            : admin
              ? "SCHOOL WORKSPACE"
              : "TEACHER WORKSPACE"}
        </p>
        <nav>
          {links
            .filter((item) => primaryPaths.includes(String(item[0])))
            .map(([path, label, Icon]) => {
              const I = Icon as typeof School;
              return (
                <NavLink
                  key={String(path)}
                  to={String(path)}
                  onClick={() => setMobile(false)}
                >
                  <I size={19} />
                  {String(label)}
                  {path === "/admin/classes" && (
                    <span className="nav-count">{db.classes.length}</span>
                  )}
                </NavLink>
              );
            })}
          {links.some((item) => !primaryPaths.includes(String(item[0]))) && (
            <details
              className="nav-more"
              key={parent ? "parent-more" : "admin-more"}
              open={
                links.some(
                  (item) =>
                    !primaryPaths.includes(String(item[0])) &&
                    loc.pathname.startsWith(String(item[0])),
                ) || undefined
              }
            >
              <summary>
                {parent ? "More options" : "Records & settings"}
              </summary>
              {navigation(
                links.filter((item) => !primaryPaths.includes(String(item[0]))),
              )}
            </details>
          )}
          <NavLink to="/tour" onClick={() => setMobile(false)}>
            <PlayCircle size={19} />
            Product tour<span className="tiny-pill">20s</span>
          </NavLink>
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <HeartHandshake size={24} />
            <strong>A little closer to home.</strong>
            <p>Meaningful progress, shared with the people who matter.</p>
            <Link to="/tour">
              See how it works <ChevronRight size={14} />
            </Link>
          </div>
          <button
            className="signout"
            onClick={() => {
              setSession(null);
              nav("/");
            }}
          >
            <LogOut size={17} /> Leave demo
          </button>
          <small className="muted">ParentReport · Frontend demo</small>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <button
            className="icon-btn mobile-menu"
            aria-label="Toggle navigation"
            onClick={() => setMobile(!mobile)}
          >
            <Menu />
          </button>
          <div className="breadcrumb">
            {parent
              ? "Parent portal"
              : admin
                ? "School admin"
                : "Class teacher"}
            <ChevronRight size={14} />
            <strong>
              {loc.pathname
                .split("/")
                .filter(Boolean)
                .at(-1)
                ?.replaceAll("-", " ")}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="term">Academic year 2026–27</span>
            <RoleSwitcher />
            <div className="avatar">
              {parent
                ? "PA"
                : admin
                  ? "SA"
                  : session?.id === "t1"
                    ? "AS"
                    : "BA"}
            </div>
          </div>
        </header>
        <main>
          <DemoNotice />
          <Outlet />
        </main>
        {parent && (
          <nav
            className="parent-bottom-nav"
            aria-label="Parent quick navigation"
          >
            {[
              ["/parent/dashboard", "Home", HeartHandshake],
              ["/parent/attendance", "Attendance", CalendarCheck],
              ["/parent/diary", "Homework diary", BookOpenCheck],
              ["/parent/notices", "Notices", Megaphone],
            ].map(([path, label, Icon]) => {
              const I = Icon as typeof School;
              return (
                <NavLink key={String(path)} to={String(path)}>
                  <I size={20} />
                  <span>{String(label)}</span>
                </NavLink>
              );
            })}
          </nav>
        )}
        <footer>
          {db.school.tagline || "School & home, connected."}
          <span>Powered by ParentReport · Demo</span>
        </footer>
      </div>
    </div>
  );
}
