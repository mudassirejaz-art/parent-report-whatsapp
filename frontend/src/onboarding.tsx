import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { useStore } from "./store";
import { Logo } from "./layouts";
import { Badge, Button, Card, Denied, Form } from "./components";
import { className, mockApi } from "./services";
export function Onboarding({ verify = false }: { verify?: boolean }) {
  const { inviteToken, token } = useParams();
  const { db, update, setSession } = useStore();
  const invitation = db.invites.find((i) => i.token === (inviteToken || token));
  const c = db.classes.find((c) => c.id === invitation?.classId);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [verificationToken, setVerificationToken] = useState("");
  const student = db.students.find((s) => s.id === invitation?.studentId);
  const guardian = db.guardians.find((g) => g.id === student?.guardianId);
  if (
    !invitation ||
    !c ||
    invitation.expiresAt < Date.now() ||
    c.status !== "active" ||
    !db.school.active
  )
    return (
      <div className="public-page">
        <Logo />
        <Denied
          title="Invitation expired or unavailable"
          message="Ask your class teacher for a fresh onboarding link. No contact was verified."
        />
      </div>
    );
  return (
    <div className="public-page">
      <Logo />
      <Card>
        <Badge>DEMO · NO REAL OTP IS SENT</Badge>
        <div className="onboarding-icon">
          <ShieldCheck size={36} />
        </div>
        <h1>
          {done
            ? "Your next step is ready."
            : verify
              ? "A connection you control."
              : "Bring a parent into the loop."}
        </h1>
        <p>
          {db.school.name} · {className(c)}
        </p>
        {done ? (
          verify ? (
            <>
              <h2>
                {consent ? "Verified & consent recorded" : "Consent declined"}
              </h2>
              <p>
                {consent
                  ? "This fictional guardian is now linked to this student."
                  : "No reports will be sent. You may return to verify and opt in later."}
              </p>
              {consent && (
                <Link
                  className="btn"
                  to="/parent/dashboard"
                  onClick={() =>
                    setSession({ id: guardian!.id, role: "parent" })
                  }
                >
                  Open private parent portal →
                </Link>
              )}
            </>
          ) : (
            <>
              <h2>Verification pending</h2>
              <p>
                Number submission does not verify a parent or grant consent.
                Hand this separate verification step to the guardian.
              </p>
              <Link className="btn" to={`/parent/verify/${verificationToken}`}>
                Simulate guardian verification →
              </Link>
            </>
          )
        ) : verify ? (
          !student || !guardian ? (
            <Denied title="Submit a contact first" />
          ) : (
            <>
              <p>
                Guardian: {guardian.name} · {guardian.phoneMasked}
              </p>
              <p className="helper">
                Fake universal demo code: <strong>123456</strong>. No OTP is
                transmitted. Link expires in 24 hours; five wrong attempts
                expire it.
              </p>
              <Form
                label={busy ? "Verifying…" : "Verify number & record consent"}
                fields={[{ name: "code", label: "Simulated OTP code" }]}
                onSubmit={(v) => {
                  if (busy) return;
                  if (v.code !== "123456") {
                    update((d) => {
                      const i = d.invites.find(
                        (i) => i.token === invitation.token,
                      )!;
                      i.attempts++;
                      if (i.attempts >= 5) {
                        i.expiresAt = 0;
                        d.students.find(
                          (s) => s.id === student.id,
                        )!.guardianLinkStatus = "expired";
                      }
                    });
                    setError("Incorrect demo code. Use 123456.");
                    return;
                  }
                  if (!consent) {
                    setError(
                      "Tick the consent box to opt in, or choose Decline.",
                    );
                    return;
                  }
                  setBusy(true);
                  update((d) => {
                    const g = d.guardians.find((g) => g.id === guardian.id)!;
                    g.phoneVerified = true;
                    g.consentedAt = new Date().toISOString();
                    d.students.find(
                      (s) => s.id === student.id,
                    )!.guardianLinkStatus = "verified";
                  });
                  setBusy(false);
                  setDone(true);
                }}
              >
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  I control this fictional number and explicitly agree to
                  receive my child’s progress reports via WhatsApp.
                </label>
                {error && (
                  <p className="error" role="alert">
                    {error}
                  </p>
                )}
              </Form>
              <Button
                secondary
                onClick={() => {
                  update((d) => {
                    const g = d.guardians.find((g) => g.id === guardian.id)!;
                    g.consentedAt = undefined;
                    g.phoneVerified = false;
                    d.students.find(
                      (s) => s.id === student.id,
                    )!.guardianLinkStatus = "declined";
                  });
                  setConsent(false);
                  setDone(true);
                }}
              >
                Decline messaging consent
              </Button>
            </>
          )
        ) : (
          <>
            <p>
              Use your class roll number. Enter fictional sample contact details
              only.
            </p>
            <Form
              label={busy ? "Submitting…" : "Submit guardian contact"}
              fields={[
                { name: "roll", label: "Roll / admission number" },
                { name: "student", label: "Confirm student full name" },
                { name: "guardian", label: "Guardian name (fictional)" },
                {
                  name: "phone",
                  label: "Fictional WhatsApp number (+923XXXXXXXXX)",
                  type: "tel",
                },
              ]}
              onSubmit={async (v) => {
                if (busy) return;
                const s = db.students.find(
                  (s) =>
                    s.classId === c.id &&
                    s.rollNumber === v.roll.trim() &&
                    s.name.toLowerCase() === v.student.trim().toLowerCase(),
                );
                if (!s) {
                  setError(
                    "Student name and roll number do not match this class.",
                  );
                  return;
                }
                if (!/^\+923\d{9}$/.test(v.phone)) {
                  setError(
                    "Use the format +923 followed by nine digits. Use fictional data only.",
                  );
                  return;
                }
                if (s.guardianLinkStatus === "verified") {
                  setError(
                    "A guardian is already verified. Number changes require guardian re-verification in the parent profile.",
                  );
                  return;
                }
                setBusy(true);
                const fingerprint = await mockApi.fingerprint(v.phone);
                if (
                  db.guardians.some(
                    (g) =>
                      g.phoneFingerprint === fingerprint &&
                      !g.linkedStudentIds.includes(s.id),
                  )
                ) {
                  setError(
                    "This sample number is already associated with another student. Ask the school to review the link.",
                  );
                  setBusy(false);
                  return;
                }
                const verifyToken = crypto.randomUUID();
                setVerificationToken(verifyToken);
                update((d) => {
                  const target = d.students.find((x) => x.id === s.id)!;
                  const id = target.guardianId || "g" + crypto.randomUUID();
                  target.guardianId = id;
                  target.guardianLinkStatus = "pending";
                  const data = {
                    id,
                    name: v.guardian,
                    phoneMasked: "+92 ••• ••• " + v.phone.slice(-4),
                    phoneFingerprint: fingerprint,
                    phoneVerified: false,
                    linkedStudentIds: [s.id],
                  };
                  d.guardians = d.guardians.filter((g) => g.id !== id);
                  d.guardians.push(data);
                  d.invites.push({
                    token: verifyToken,
                    classId: c.id,
                    expiresAt: Date.now() + 86400000,
                    studentId: s.id,
                    attempts: 0,
                  });
                });
                setBusy(false);
                setDone(true);
              }}
            >
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
            </Form>
          </>
        )}
        <p className="helper">
          Frontend simulation only. The real backend must verify identity, token
          ownership and consent independently.
        </p>
      </Card>
      <Link to="/">← Back to demo roles</Link>
    </div>
  );
}
