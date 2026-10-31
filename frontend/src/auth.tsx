import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  ArrowRight,
  School,
  GraduationCap,
  HeartHandshake,
  ShieldCheck,
} from "lucide-react";
import { Logo } from "./layouts";
import { useStore } from "./store";
import { Button, Form } from "./components";
import { useState } from "react";
export function Auth() {
  const { db, setSession } = useStore();
  const nav = useNavigate();
  const loc = useLocation();
  const parent = loc.pathname === "/parent/login";
  const teacher = loc.pathname === "/teacher/login";
  const login = loc.pathname !== "/";
  const [error, setError] = useState("");
  function enter(id: string) {
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
  }
  return (
    <div className="auth-page">
      <div className="auth-art">
        <Logo />
        <div>
          <p className="eyebrow">LESS ADMIN. MORE CONNECTION.</p>
          <h1>
            Every little win.
            <br />A little closer
            <br />
            to home.
          </h1>
          <p>
            From the classroom to a parent's phone.
            <br />
            Progress reporting that brings everyone together.
          </p>
          <div className="auth-visual">
            <span className="floating-check">✓</span>
            <small>OCTOBER ASSESSMENT</small>
            <h2>
              Ahmed is making
              <br />
              great progress.
            </h2>
            <div className="auth-score">
              85% <span>Overall performance</span>
            </div>
            <div className="mini-bars">
              {[55, 66, 61, 74, 85].map((h, i) => (
                <i key={i} style={{ height: h }} />
              ))}
            </div>
            <p>Bright Future Academy · Sample report</p>
          </div>
        </div>
        <small>Built for schools and academies in Pakistan.</small>
      </div>
      <div className="auth-content">
        <BadgeDemo />
        <h1>
          {login
            ? parent
              ? "Welcome, parents."
              : teacher
                ? "Your classroom awaits."
                : "Welcome back."
            : "One school. Three connected spaces."}
        </h1>
        <p className="muted">
          {login
            ? "Explore a simulated session. No password or real OTP required."
            : "Choose a demo experience to explore ParentReport."}
        </p>
        {login ? (
          <Form
            label={
              parent ? "Verify & open parent demo" : "Enter demo workspace"
            }
            fields={
              parent
                ? [
                    {
                      name: "account",
                      label: "Fictional parent account",
                      options: db.guardians
                        .filter((g) => g.phoneVerified && g.consentedAt)
                        .map((g) => ({
                          value: g.id,
                          label: `${g.name} · ${g.phoneMasked}`,
                        })),
                    },
                    {
                      name: "code",
                      label: "Simulated OTP · use demo code 123456",
                      type: "text",
                    },
                  ]
                : teacher
                  ? [
                      {
                        name: "account",
                        label: "Teacher account",
                        options: db.teachers.map((t) => ({
                          value: t.id,
                          label: t.name,
                        })),
                      },
                    ]
                  : [
                      {
                        name: "account",
                        label: "Demo admin email",
                        type: "email",
                        value: "admin@example.test",
                      },
                    ]
            }
            onSubmit={(v) => {
              if (parent && v.code !== "123456") {
                setError("Incorrect demo code. Use 123456.");
                return;
              }
              enter(parent || teacher ? v.account : "admin");
            }}
          >
            {parent && (
              <p className="helper">
                Existing verified, consented demo accounts only. New guardians
                verify separately from their invitation.
              </p>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </Form>
        ) : (
          <div className="role-cards">
            {[
              {
                title: "School admin",
                text: "Launch classes. Empower teachers. See the bigger picture.",
                path: "/admin/login",
                Icon: School,
              },
              {
                title: "Class teacher",
                text: "Your students, their progress, and a simpler school day.",
                path: "/teacher/login",
                Icon: GraduationCap,
              },
              {
                title: "Parent",
                text: "A private window into your child’s learning journey.",
                path: "/parent/login",
                Icon: HeartHandshake,
              },
            ].map((r) => (
              <Link key={r.path} to={r.path}>
                <r.Icon />
                <div>
                  <h3>{r.title}</h3>
                  <p>{r.text}</p>
                </div>
                <ArrowRight size={19} />
              </Link>
            ))}
          </div>
        )}
        {login && (
          <Link className="text-link" to="/">
            ← Choose another role
          </Link>
        )}
        <Link className="text-link" to="/tour">
          Watch the 20-second product tour →
        </Link>
        <p className="auth-disclaimer">
          <ShieldCheck size={16} /> Demo only. No real authentication or
          WhatsApp delivery.
        </p>
        <Button
          secondary
          onClick={() => {
            enter("admin");
          }}
        >
          Quick explore as admin
        </Button>
      </div>
    </div>
  );
}
function BadgeDemo() {
  return <span className="badge">INTERACTIVE FRONTEND DEMO</span>;
}
