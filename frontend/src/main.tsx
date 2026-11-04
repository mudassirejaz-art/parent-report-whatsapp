import React, { useEffect, useState, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { Provider, useStore } from "./store";
import { Auth } from "./auth";
import { Shell } from "./layouts";
import { AdminDashboard, Classes, Settings, Teachers } from "./admin";
import { Classroom, Exams, Students, TeacherDashboard } from "./classroom";
import { ParentChild, ParentDashboard, ParentSettings } from "./parent";
import { Reports, Logs } from "./reports";
import { Onboarding } from "./onboarding";
import { AttendancePage } from "./attendance";
import { Noticeboard } from "./notices";
import { HomeworkDiary } from "./diary";
import { LeaveRequests } from "./leaves";
const Tour = lazy(() => import("./tour").then((m) => ({ default: m.Tour })));
const ConnectedWorkspace = lazy(() => import("./live"));
const ConnectedOnboarding = lazy(() =>
  import("./live/onboarding").then((m) => ({ default: m.PublicOnboarding })),
);
import { Denied } from "./components";
import type { Role } from "./types";
import "./styles.css";
import "./school-life.css";
import "./improvements.css";
import { LanguageSwitcher } from "./i18n/LanguageSwitcher";
import { useLanguage } from "./i18n/state";
import "./i18n/language.css";
import "./simpler.css";
function Guard({ role }: { role: Role }) {
  const { session } = useStore();
  if (!session)
    return (
      <Navigate
        to={
          role === "school_admin"
            ? "/admin/login"
            : role === "parent"
              ? "/parent/login"
              : "/teacher/login"
        }
        replace
      />
    );
  if (session.role !== role)
    return (
      <Denied message="This page belongs to another role. Choose the correct demo account to continue." />
    );
  return <Outlet />;
}
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="empty">
        <h1>We couldn’t open this view.</h1>
        <p>Your demo data is saved in this browser.</p>
        <button className="btn" onClick={() => location.assign("/")}>
          Return to demo roles
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
function Scroll() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
function App() {
  useLanguage();
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 250);
    return () => clearTimeout(t);
  }, []);
  if (loading)
    return (
      <div className="loading" role="status">
        <span className="brand-icon">PR</span>
        <p>Opening your school workspace…</p>
      </div>
    );
  return (
    <>
      <Scroll />
      <Routes>
        <Route
          path="/enroll"
          element={
            <Suspense fallback={<p role="status">Opening invitation…</p>}>
              <ConnectedOnboarding />
            </Suspense>
          }
        />
        <Route
          path="/verify-guardian"
          element={
            <Suspense
              fallback={<p role="status">Opening parent verification…</p>}
            >
              <ConnectedOnboarding verify />
            </Suspense>
          }
        />
        <Route
          path="/workspace/*"
          element={
            <Suspense
              fallback={
                <div className="loading" role="status">
                  Opening school workspace…
                </div>
              }
            >
              <ConnectedWorkspace />
            </Suspense>
          }
        />
        <Route path="/" element={<Auth />} />
        {["/login", "/admin/login", "/teacher/login", "/parent/login"].map(
          (p) => (
            <Route key={p} path={p} element={<Auth />} />
          ),
        )}
        <Route
          path="/tour"
          element={
            <Suspense
              fallback={
                <div className="loading" role="status">
                  Loading product tour…
                </div>
              }
            >
              <Tour />
            </Suspense>
          }
        />
        <Route
          path="/join/:inviteToken"
          element={<Onboarding key="student-submission" />}
        />
        <Route
          path="/parent/verify/:token"
          element={<Onboarding key="guardian-verification" verify />}
        />
        <Route
          path="/register-parent/:token"
          element={<Onboarding key="guardian-verification" verify />}
        />
        <Route element={<Guard role="school_admin" />}>
          <Route element={<Shell />}>
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/classes" element={<Classes />} />
            <Route path="/admin/classes/new" element={<Classes />} />
            <Route path="/admin/classes/:classId" element={<Classroom />} />
            <Route
              path="/admin/classes/:classId/:tab"
              element={<Classroom />}
            />
            <Route
              path="/admin/classes/:classId/exams/:examId/marks"
              element={<Classroom />}
            />
            <Route path="/admin/teachers" element={<Teachers />} />
            <Route path="/admin/students" element={<Students />} />
            <Route path="/admin/exams" element={<Exams />} />
            <Route path="/admin/reports" element={<Reports />} />
            <Route path="/admin/logs" element={<Logs />} />
            <Route path="/admin/settings" element={<Settings />} />
            <Route path="/admin/attendance" element={<AttendancePage />} />
            <Route path="/admin/notices" element={<Noticeboard />} />
            <Route path="/admin/diary" element={<HomeworkDiary />} />
            <Route path="/admin/leave-requests" element={<LeaveRequests />} />
          </Route>
        </Route>
        <Route element={<Guard role="class_teacher" />}>
          <Route element={<Shell />}>
            <Route path="/teacher/dashboard" element={<TeacherDashboard />} />
            <Route path="/teacher/notices" element={<Noticeboard />} />
            <Route
              path="/teacher/classes/:classId/:tab"
              element={<Classroom />}
            />
            <Route
              path="/teacher/classes/:classId/exams/:examId/marks"
              element={<Classroom />}
            />
          </Route>
        </Route>
        <Route element={<Guard role="parent" />}>
          <Route element={<Shell />}>
            <Route path="/parent/dashboard" element={<ParentDashboard />} />
            <Route
              path="/parent/children/:studentId"
              element={<ParentChild />}
            />
            <Route
              path="/parent/children/:studentId/reports/:examId"
              element={<ParentChild />}
            />
            <Route path="/parent/settings" element={<ParentSettings />} />
            <Route path="/parent/attendance" element={<AttendancePage />} />
            <Route path="/parent/notices" element={<Noticeboard />} />
            <Route path="/parent/diary" element={<HomeworkDiary />} />
            <Route path="/parent/leave-requests" element={<LeaveRequests />} />
            <Route
              path="/parent/children/:studentId/attendance"
              element={<AttendancePage />}
            />
          </Route>
        </Route>
        <Route
          path="*"
          element={
            <Denied
              title="Page not found"
              message="This demo route does not exist. Return to the role selector to continue."
            />
          }
        />
      </Routes>
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Provider>
        <BrowserRouter>
          <App />
          <LanguageSwitcher />
        </BrowserRouter>
      </Provider>
    </ErrorBoundary>
  </React.StrictMode>,
);
