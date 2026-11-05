import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Card, Badge, Empty, PageTitle } from "../components";
import { api, setCsrf, type Actor } from "./api";
import { ActionButton, RemoteForm, RemoteState, useRemote } from "./common";
import "./live.css";

type ConsentRecord = {
  id: string;
  student_name: string;
  phone_masked: string;
  verification_method: string;
  consented: boolean;
};
export function ParentConsentSettings() {
  const remote = useRemote<ConsentRecord[]>("/me/guardian-links");
  return (
    <Card>
      <details>
        <summary>WhatsApp report consent</summary>
        <p>
          Manage report-message consent separately from access to your child's
          records.
        </p>
        <RemoteState {...remote} retry={remote.refresh} />
        {remote.data?.map((link) => (
          <div className="live-guardian-row" key={link.id}>
            <div>
              <h3>{link.student_name}</h3>
              <p>{link.phone_masked}</p>
              <Badge>
                {link.consented ? "Consent recorded" : "Consent withdrawn"}
              </Badge>
              {link.verification_method !== "provider" && (
                <p className="helper">Local simulation / fictional fixture</p>
              )}
            </div>
            {link.consented && (
              <ActionButton
                secondary
                onAction={async () => {
                  await api(
                    "/me/guardian-links/" + link.id + "/consent",
                    "DELETE",
                  );
                  remote.refresh();
                  return "Consent withdrawn. Access to your child's reports is unchanged.";
                }}
              >
                Withdraw WhatsApp consent
              </ActionButton>
            )}
          </div>
        ))}
      </details>
    </Card>
  );
}

type GuardianRow = {
  enrollment_id: string;
  student_name: string;
  status: string;
  phone_masked: string | null;
  verification_method: string | null;
  consented: boolean;
  invite_id: string | null;
  invite_active: boolean;
  invite_expires_at: string | null;
};
export function GuardianLinks({ classId }: { classId: string }) {
  const mode = useRemote<{
    local_testing: boolean;
    provider_configured: boolean;
  }>("/onboarding/config");
  const rows = useRemote<GuardianRow[]>(
    mode.data?.local_testing || mode.data?.provider_configured
      ? "/classes/" + classId + "/guardian-links"
      : null,
  );
  const [links, setLinks] = useState<Record<string, string>>({});
  return (
    <Card>
      <h2>Parent linking</h2>
      <RemoteState {...mode} retry={mode.refresh} />
      {mode.data &&
        (!mode.data.local_testing && !mode.data.provider_configured ? (
          <p>
            Guardian onboarding is not enabled. Ask your school administrator to
            configure verification.
          </p>
        ) : (
          <>
            {mode.data.local_testing && <SimulationNotice />}
            <p>
              Create a private invitation for one student. The student submits a
              guardian number; the parent completes a separate verification and
              consent step.
            </p>
            <RemoteState {...rows} retry={rows.refresh} />
            {rows.data?.map((row) => (
              <div className="live-guardian-row" key={row.enrollment_id}>
                <div>
                  <h3>{row.student_name}</h3>
                  <Badge>{row.status.replaceAll("_", " ")}</Badge>
                  {row.phone_masked && <p>{row.phone_masked}</p>}
                  {row.status === "verified" && (
                    <p className="helper">
                      {row.verification_method === "provider"
                        ? "Provider verified"
                        : "Local simulation / fictional fixture"}{" "}
                      ·{" "}
                      {row.consented
                        ? "Consent recorded"
                        : "No WhatsApp consent"}
                    </p>
                  )}
                </div>
                {row.status !== "verified" && (
                  <div className="live-buttons">
                    <ActionButton
                      secondary
                      onAction={async () => {
                        const result = await api<{ path: string }>(
                          "/classes/" + classId + "/guardian-invites",
                          "POST",
                          { enrollment_id: row.enrollment_id },
                        );
                        setLinks((prev) => ({
                          ...prev,
                          [row.enrollment_id]: location.origin + result.path,
                        }));
                        rows.refresh();
                        return "Invitation created. It expires in 24 hours.";
                      }}
                    >
                      {row.invite_id
                        ? "Create new invitation"
                        : "Create invitation"}
                    </ActionButton>
                    {row.invite_id &&
                      (row.invite_active || row.status === "pending") && (
                        <ActionButton
                          secondary
                          onAction={async () => {
                            await api(
                              "/classes/" +
                                classId +
                                "/guardian-invites/" +
                                row.invite_id,
                              "DELETE",
                            );
                            setLinks((prev) => {
                              const next = { ...prev };
                              delete next[row.enrollment_id];
                              return next;
                            });
                            rows.refresh();
                          }}
                        >
                          Revoke invitation
                        </ActionButton>
                      )}
                  </div>
                )}
                {links[row.enrollment_id] && row.status !== "verified" && (
                  <div className="live-invite-result">
                    <label>
                      Private student invitation
                      <input
                        readOnly
                        value={links[row.enrollment_id]}
                        onFocus={(e) => e.currentTarget.select()}
                      />
                    </label>
                    <div className="live-buttons">
                      <a
                        className="btn secondary"
                        href={links[row.enrollment_id]}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open student form
                      </a>
                      <ActionButton
                        secondary
                        onAction={async () => {
                          await navigator.clipboard.writeText(
                            links[row.enrollment_id],
                          );
                          return "Invitation copied.";
                        }}
                      >
                        Copy invitation
                      </ActionButton>
                    </div>
                    <p className="helper">
                      Share privately with this student. Reissuing invalidates
                      older invitations and pending verification.
                    </p>
                  </div>
                )}
              </div>
            ))}
          </>
        ))}
    </Card>
  );
}
function SimulationNotice() {
  return (
    <div className="live-simulation" role="note">
      <strong>LOCAL VERIFICATION SIMULATION</strong>
      <p>
        Fictional testing only. No OTP or WhatsApp message is sent, and the test
        code does not prove control of a phone number.
      </p>
    </div>
  );
}
type InviteInfo = {
  school_name: string;
  class_name: string;
  expires_at: string;
};
type VerificationInfo = InviteInfo & {
  student_name: string;
  guardian_name: string;
  phone_masked: string;
  local_test_code?: string;
  is_simulation: boolean;
};
function useCapability<T>(path: string, token: string) {
  const [info, setInfo] = useState<T | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    api<T>(path, "POST", { token }, controller.signal)
      .then(setInfo)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [path, token]);
  return { info, error };
}
export function PublicOnboarding({ verify = false }: { verify?: boolean }) {
  const loc = useLocation();
  const token = loc.hash.slice(1);
  const valid = /^[A-Za-z0-9_-]{43}$/.test(token);
  const mode = useRemote<{
    local_testing: boolean;
    provider_configured: boolean;
  }>("/onboarding/config");
  return (
    <main className="live-onboarding">
      <Link className="brand" to="/workspace">
        <span className="brand-icon">PR</span>ParentReport
      </Link>
      <RemoteState {...mode} retry={mode.refresh} />
      {mode.data &&
        (!mode.data.local_testing && !mode.data.provider_configured ? (
          <Empty title="Verification is unavailable">
            <p>
              Your school has not enabled a verification provider. Contact the
              school for help.
            </p>
          </Empty>
        ) : valid ? (
          <>
            {mode.data.local_testing && <SimulationNotice />}
            {verify ? (
              <ParentVerification
                key={token}
                token={token}
                local={mode.data.local_testing}
              />
            ) : (
              <StudentSubmission
                key={token}
                token={token}
                local={mode.data.local_testing}
              />
            )}
          </>
        ) : (
          <Empty title="This invitation link is incomplete">
            <p>
              Open the full private link supplied by your school. Ask for a new
              link if it was cut off.
            </p>
          </Empty>
        ))}
    </main>
  );
}
function StudentSubmission({
  token,
  local,
}: {
  token: string;
  local: boolean;
}) {
  const { info, error } = useCapability<InviteInfo>(
    "/onboarding/invite-info",
    token,
  );
  const [result, setResult] = useState("");
  return (
    <>
      <PageTitle
        title="Link a guardian contact"
        description="Step 1 of 2 · Student or supervised school onboarding"
      />
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {info && !result && (
        <Card>
          <p className="eyebrow">{info.school_name}</p>
          <h2>{info.class_name}</h2>
          <p>
            Enter your admission number and a parent or guardian's WhatsApp
            contact. This submission does not verify the parent or give
            messaging consent.
          </p>
          <RemoteForm
            label="Submit guardian contact"
            fields={[
              { name: "admission_number", label: "Your admission number" },
              { name: "guardian_name", label: "Parent or guardian name" },
              { name: "phone", label: "Parent WhatsApp number", type: "tel" },
            ]}
            onSubmit={async (v) => {
              const response = await api<{ verification_path: string }>(
                "/onboarding/submit",
                "POST",
                { ...v, token },
              );
              setResult(location.origin + response.verification_path);
            }}
          />
        </Card>
      )}
      {result && (
        <Card>
          <Badge>Verification pending</Badge>
          <h2>Now the parent completes step 2.</h2>
          <p>
            {local
              ? "The guardian must review the child details, enter the separate local test code and choose whether to consent."
              : "Share this private link with the guardian. They need the code sent to their WhatsApp to verify the number."}
          </p>
          <a className="btn" href={result} target="_blank" rel="noreferrer">
            Open separate parent verification
          </a>
          <label className="live-share-label">
            Private parent verification link
            <input
              readOnly
              value={result}
              onFocus={(e) => e.currentTarget.select()}
            />
          </label>
          <ActionButton
            secondary
            onAction={async () => {
              await navigator.clipboard.writeText(result);
              return "Parent link copied.";
            }}
          >
            Copy parent link
          </ActionButton>
          <p className="helper">
            Verification expires in 10 minutes. For a wrong number or expired
            link, ask the teacher to issue a new student invitation.
          </p>
        </Card>
      )}
    </>
  );
}
function ParentVerification({
  token,
  local,
}: {
  token: string;
  local: boolean;
}) {
  const { info, error } = useCapability<VerificationInfo>(
    "/onboarding/verification-info",
    token,
  );
  const [existing, setExisting] = useState(false),
    [actor, setActor] = useState<Actor | null>(null),
    [consent, setConsent] = useState(false),
    [complete, setComplete] = useState("");
  const [code, setCode] = useState("");
  if (complete)
    return (
      <Card>
        <Badge>
          {complete === "declined"
            ? "Consent declined"
            : local
              ? "Local parent link complete"
              : "Parent link complete"}
        </Badge>
        <h1>
          {complete === "declined"
            ? "Your choice has been recorded."
            : "Your parent account is ready."}
        </h1>
        <p>
          {complete === "declined"
            ? "No new guardian link or messaging consent was created. Ask the school for a fresh invitation if you change your mind."
            : local
              ? "This was a local simulation. Sign in to read only your linked child's published records."
              : "Sign in to read your linked child's published records."}
        </p>
        <Link className="btn" to="/workspace">
          Go to parent sign in
        </Link>
      </Card>
    );
  return (
    <>
      <PageTitle
        title="Parent verification & consent"
        description="Step 2 of 2 · The parent completes this step separately"
      />
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {info && (
        <Card>
          <p className="eyebrow">{info.school_name}</p>
          <h2>{info.student_name}</h2>
          <p>{info.class_name}</p>
          <p>
            Guardian: {info.guardian_name}
            <br />
            Contact submitted: {info.phone_masked}
          </p>
          <p className="helper">
            If these details are wrong, stop and ask the school for a corrected
            invitation.
          </p>
          {local && (
            <div className="live-test-code">
              <strong>
                Local test code: <code>{info.local_test_code}</code>
              </strong>
              <p>
                This code is shown only in explicitly enabled local mode. No
                real OTP was sent.
              </p>
            </div>
          )}
          <label className="live-share-label">
            {local
              ? "Enter local test code"
              : "Enter WhatsApp verification code"}
            <input
              aria-label={
                local
                  ? "Enter local test code"
                  : "Enter WhatsApp verification code"
              }
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
          </label>
          <label className="live-consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              I am this child's guardian and I explicitly agree to receive
              school progress reports on this WhatsApp contact. I can withdraw
              this consent later.
            </span>
          </label>
          <div className="live-tabs">
            <button
              className={!existing ? "active" : ""}
              onClick={() => {
                setExisting(false);
                setActor(null);
              }}
            >
              Create parent account
            </button>
            <button
              className={existing ? "active" : ""}
              onClick={() => setExisting(true)}
            >
              I already have an account
            </button>
          </div>
          {!existing ? (
            <RemoteForm
              label={
                local
                  ? "Verify locally & create account"
                  : "Verify number & create account"
              }
              fields={[
                { name: "email", label: "Parent email", type: "email" },
                {
                  name: "password",
                  label: "Create password · at least 12 characters",
                  type: "password",
                },
                {
                  name: "confirm",
                  label: "Confirm password",
                  type: "password",
                },
              ]}
              onSubmit={async (v) => {
                if (local && !consent)
                  throw Error(
                    "Choose whether to give consent. It is never selected automatically.",
                  );
                if (v.password !== v.confirm)
                  throw Error("The passwords do not match.");
                if (code.length !== 6)
                  throw Error(
                    local
                      ? "Enter the six-digit local test code."
                      : "Enter the six-digit WhatsApp verification code.",
                  );
                await api("/onboarding/register", "POST", {
                  token,
                  code,
                  consent,
                  email: v.email,
                  password: v.password,
                });
                setComplete("verified");
              }}
            />
          ) : actor ? (
            <>
              <p className="live-success">Signed in as {actor.name}</p>
              <ActionButton
                onAction={async () => {
                  if (local && !consent)
                    throw Error(
                      "Explicit guardian consent is required to complete this test flow.",
                    );
                  await api("/onboarding/link-existing", "POST", {
                    token,
                    code,
                    consent,
                  });
                  setComplete("verified");
                }}
              >
                {local
                  ? "Verify locally & link this child"
                  : "Verify number & link this child"}
              </ActionButton>
            </>
          ) : (
            <RemoteForm
              label="Sign in as existing parent"
              fields={[
                {
                  name: "email",
                  label: "Existing parent email",
                  type: "email",
                },
                {
                  name: "password",
                  label: "Existing parent password",
                  type: "password",
                },
              ]}
              onSubmit={async (v) => {
                const user = await api<Actor>("/auth/login", "POST", v);
                setCsrf(user.csrf_token);
                setActor(user);
              }}
            />
          )}
          {local && (
            <ActionButton
              secondary
              onAction={async () => {
                if (code.length !== 6)
                  throw Error(
                    "Enter the local test code before recording your choice.",
                  );
                await api("/onboarding/decline", "POST", {
                  token,
                  code,
                  consent: false,
                });
                setComplete("declined");
              }}
            >
              I do not consent
            </ActionButton>
          )}
        </Card>
      )}
    </>
  );
}
