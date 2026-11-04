import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { LockKeyhole, Monitor, ShieldCheck } from "lucide-react";
import { api, setCsrf, type Actor } from "./api";
import { ActionButton, RemoteForm, RemoteState, useRemote } from "./common";
import "./live.css";

type Session = {
  id: string;
  current: boolean;
  created_at: string;
  expires_at: string;
};
function validate(values: Record<string, string>) {
  if (values.new_password.length < 12 || values.new_password.length > 128)
    throw Error("Use between 12 and 128 characters for your new password.");
  if (values.new_password !== values.confirm_password)
    throw Error("Passwords do not match.");
}
const newFields = [
  {
    name: "new_password",
    label: "New password · at least 12 characters",
    type: "password",
    maxLength: 128,
  },
  {
    name: "confirm_password",
    label: "Confirm new password",
    type: "password",
    maxLength: 128,
  },
];
export function AccountSettings({ actor }: { actor: Actor }) {
  const sessions = useRemote<Session[]>("/auth/sessions");
  const [changed, setChanged] = useState(0);
  return (
    <>
      <div className="live-title">
        <div>
          <p className="eyebrow">YOUR ACCOUNT</p>
          <h1>Account & security</h1>
          <p className="muted">
            Keep your school account private and in your control.
          </p>
        </div>
        <ShieldCheck size={32} />
      </div>
      <div className="live-account-grid">
        <section className="card">
          <h2>
            <LockKeyhole size={20} /> Change password
          </h2>
          <p>
            <strong>{actor.name}</strong>
            <br />
            <span className="muted">{actor.email}</span>
          </p>
          <p className="helper">
            Changing your password signs out every other session. This browser
            stays signed in securely.
          </p>
          <RemoteForm
            key={changed}
            label="Update password"
            fields={[
              {
                name: "current_password",
                label: "Current password",
                type: "password",
                maxLength: 128,
              },
              ...newFields,
            ]}
            onSubmit={async (v) => {
              validate(v);
              const user = await api<Actor>("/auth/change-password", "POST", {
                current_password: v.current_password,
                new_password: v.new_password,
              });
              setCsrf(user.csrf_token);
              setChanged((n) => n + 1);
              sessions.refresh();
            }}
          />
          {changed > 0 && (
            <p className="live-success" role="status">
              Password updated. Other sessions have been signed out.
            </p>
          )}
        </section>
        <section className="card">
          <h2>
            <Monitor size={20} /> Active sessions
          </h2>
          <p className="helper">
            Sessions expire after 8 hours. Sign out sessions you no longer use.
            Times are shown in Pakistan time.
          </p>
          <RemoteState {...sessions} retry={sessions.refresh} />
          {sessions.data?.map((s) => (
            <div className="live-session" key={s.id}>
              <div>
                <strong>
                  {s.current ? "This browser" : "Another signed-in session"}
                </strong>
                <small>
                  Signed in{" "}
                  {new Date(s.created_at).toLocaleString("en-PK", {
                    timeZone: "Asia/Karachi",
                  })}
                </small>
                <small>
                  Expires{" "}
                  {new Date(s.expires_at).toLocaleString("en-PK", {
                    timeZone: "Asia/Karachi",
                  })}
                </small>
              </div>
              {s.current ? (
                <span className="badge">Current</span>
              ) : (
                <ActionButton
                  secondary
                  onAction={async () => {
                    await api("/auth/sessions/" + s.id, "DELETE");
                    sessions.refresh();
                    return "Session signed out.";
                  }}
                >
                  Sign out session
                </ActionButton>
              )}
            </div>
          ))}
          {(sessions.data?.filter((s) => !s.current).length ?? 0) > 0 && (
            <ActionButton
              secondary
              onAction={async () => {
                await api("/auth/sessions/revoke-others", "POST");
                sessions.refresh();
                return "Other sessions signed out.";
              }}
            >
              Sign out all other sessions
            </ActionButton>
          )}
        </section>
      </div>
    </>
  );
}
export function PasswordRecovery({ reset = false }: { reset?: boolean }) {
  const location = useLocation();
  return <RecoveryScreen key={location.key} reset={reset} />;
}
function RecoveryScreen({ reset }: { reset: boolean }) {
  const config = useRemote<{ local_only: boolean }>("/auth/recovery-config");
  const location = useLocation();
  const [link, setLink] = useState("");
  const [done, setDone] = useState(false);
  const token = location.hash.slice(1);
  return (
    <main className="live-recovery">
      <Link className="brand" to="/workspace">
        <ShieldCheck />
        ParentReport
      </Link>
      <section className="card">
        <p className="eyebrow">ACCOUNT RECOVERY</p>
        <h1>{reset ? "Choose a new password" : "Forgot your password?"}</h1>
        <RemoteState {...config} retry={config.refresh} />
        {config.data && !config.data.local_only && (
          <p role="status">
            Password recovery is not configured. Contact your school
            administrator.
          </p>
        )}
        {config.data?.local_only && (
          <>
            <div className="live-local-warning">
              <strong>Local testing simulation</strong>
              <p>
                No email is sent. Test links are displayed here and expire after
                15 minutes. Use fictional accounts only.
              </p>
            </div>
            {done ? (
              <p className="live-success" role="status">
                Password reset complete. Sign in with your new password. All
                previous sessions have ended.
              </p>
            ) : reset ? (
              /^[A-Za-z0-9_-]{43}$/.test(token) ? (
                <RemoteForm
                  label="Reset password"
                  fields={newFields}
                  onSubmit={async (v) => {
                    validate(v);
                    await api("/auth/local-recovery/complete", "POST", {
                      token,
                      new_password: v.new_password,
                    });
                    setDone(true);
                    window.history.replaceState(null, "", "/reset-password");
                  }}
                />
              ) : (
                <p className="error" role="alert">
                  Open a valid reset link or request a new one.
                </p>
              )
            ) : (
              <RemoteForm
                label="Create local test link"
                fields={[
                  {
                    name: "email",
                    label: "Account email address",
                    type: "email",
                    maxLength: 254,
                  },
                ]}
                onSubmit={async (v) => {
                  const r = await api<{ reset_path: string }>(
                    "/auth/local-recovery",
                    "POST",
                    v,
                  );
                  setLink(r.reset_path);
                }}
              />
            )}
            {link && !reset && !done && (
              <p className="live-success" role="status">
                If this account exists, this local test link can reset its
                password.{" "}
                <Link className="text-link" to={link}>
                  Open local reset link →
                </Link>
              </p>
            )}
          </>
        )}
        <Link className="text-link" to="/workspace">
          Back to sign in →
        </Link>
        {reset && !done && (
          <Link className="text-link" to="/forgot-password">
            Request a new link
          </Link>
        )}
      </section>
    </main>
  );
}
