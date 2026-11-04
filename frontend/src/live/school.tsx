import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { Link, useLocation } from "react-router-dom";
import { api, setCsrf, ApiError } from "./api";
import { ActionButton, RemoteForm, RemoteState, useRemote } from "./common";
import { Card, PageTitle, Empty } from "../components";
import type { Actor } from "./api";
import "./live.css";

export type SchoolProfile = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  address: string | null;
  contact_email: string | null;
  tagline: string | null;
  accent: string;
  logo_object_key: string | null;
};
type SchoolContextValue = {
  schools: SchoolProfile[];
  loading: boolean;
  error: string;
  refresh: () => void;
};
const SchoolContext = createContext<SchoolContextValue | null>(null);
export function useSchools() {
  const value = useContext(SchoolContext);
  if (!value) throw Error("School provider missing");
  return value;
}
export function SchoolProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const previousPath = useRef(pathname);
  const remote = useRemote<SchoolProfile[]>("/schools");
  const refresh = remote.refresh;
  useEffect(() => {
    if (previousPath.current !== pathname) {
      previousPath.current = pathname;
      refresh();
    }
  }, [pathname, refresh]);
  useEffect(() => {
    const update = () => refresh();
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("parentreport-school-branding")
        : null;
    if (channel) channel.onmessage = update;
    window.addEventListener("pr-school-updated", update);
    window.addEventListener("focus", update);
    return () => {
      channel?.close();
      window.removeEventListener("pr-school-updated", update);
      window.removeEventListener("focus", update);
    };
  }, [refresh]);
  return (
    <SchoolContext.Provider
      value={{
        schools: remote.data ?? [],
        loading: remote.loading,
        error: remote.error,
        refresh,
      }}
    >
      {children}
    </SchoolContext.Provider>
  );
}
export function announceSchoolUpdate() {
  window.dispatchEvent(new Event("pr-school-updated"));
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel("parentreport-school-branding");
    channel.postMessage("refresh");
    channel.close();
  }
}
export const logoUrl = (school: SchoolProfile) =>
  "/api/v1/schools/" +
  school.id +
  "/logo?v=" +
  encodeURIComponent(school.logo_object_key ?? "");

export function SchoolRegistration() {
  const mode = useRemote<{ enabled: boolean }>("/auth/registration-config");
  const [created, setCreated] = useState(false),
    [mail, setMail] = useState("");
  return (
    <main className="live-onboarding">
      <Link className="brand" to="/workspace">
        <span className="brand-icon">PR</span>ParentReport
      </Link>
      <PageTitle
        title="A fresh start for your school"
        description="Create your school workspace and its first administrator account."
      />
      <RemoteState {...mode} retry={mode.refresh} />
      {mode.data && !mode.data.enabled && (
        <Empty title="School registration is closed">
          <p>Contact your administrator to set up a school.</p>
        </Empty>
      )}
      {mode.data?.enabled &&
        (created ? (
          <Card>
            <span className="badge">SCHOOL CREATED</span>
            <h2>Your school workspace is ready.</h2>
            <p>
              Sign in with {mail} and the password you just created, then add
              your classes and teachers.
            </p>
            <ActionButton
              onAction={async () => {
                let current: Actor | null = null;
                try {
                  current = await api<Actor>("/auth/me");
                } catch (e) {
                  if (!(e instanceof ApiError) || e.status !== 401) throw e;
                }
                if (current) {
                  setCsrf(current.csrf_token);
                  await api("/auth/logout", "POST");
                }
                setCsrf("");
                location.assign("/workspace");
              }}
            >
              Sign in to your new school
            </ActionButton>
          </Card>
        ) : (
          <Card>
            <h2>School & administrator details</h2>
            <RemoteForm
              label="Create school workspace"
              fields={[
                { name: "school_name", label: "School or academy name" },
                {
                  name: "slug",
                  label:
                    "School handle · lowercase letters, numbers and hyphens",
                },
                { name: "city", label: "City" },
                { name: "admin_name", label: "Your full name" },
                { name: "email", label: "Administrator email", type: "email" },
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
              onSubmit={async (values) => {
                if (values.password !== values.confirm)
                  throw Error("The passwords do not match.");
                const { confirm, ...body } = values;
                await api("/auth/register-school", "POST", body);
                setMail(values.email);
                setCreated(true);
              }}
            />
            <p className="helper">
              Use an email you can access and keep your password safe. This
              creates a separate school; it does not claim an existing school's
              records.
            </p>
            <Link className="text-link" to="/workspace">
              Already have an account? Sign in →
            </Link>
          </Card>
        ))}
    </main>
  );
}
export function SchoolSettings({ actor }: { actor: Actor }) {
  const schools = useSchools();
  const admins = schools.schools.filter((s) =>
    actor.memberships.some(
      (m) => m.school_id === s.id && m.role === "school_admin",
    ),
  );
  const [selected, setSelected] = useState("");
  const school = admins.find((s) => s.id === selected) ?? admins[0];
  if (!actor.memberships.some((m) => m.role === "school_admin"))
    return <Empty title="School admin access required" />;
  return (
    <>
      <PageTitle
        title="Make this space yours"
        description="Your school's name, identity and contact details, shared consistently with your teachers and parents."
      />
      <RemoteState {...schools} retry={schools.refresh} />
      {admins.length > 1 && (
        <label className="live-date">
          School
          <select
            aria-label="School to edit"
            value={school?.id ?? ""}
            onChange={(e) => setSelected(e.target.value)}
          >
            {admins.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {school && <SchoolSettingsForm key={school.id} school={school} />}
    </>
  );
}
function SchoolSettingsForm({ school }: { school: SchoolProfile }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState("");
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <>
      <Card>
        <h2>School profile</h2>
        <p className="muted">Handle: {school.slug}</p>
        <RemoteForm
          key={[
            school.name,
            school.city,
            school.address,
            school.contact_email,
            school.tagline,
            school.accent,
          ].join("|")}
          label="Save school profile"
          fields={[
            {
              name: "name",
              label: "School name",
              value: school.name,
              maxLength: 160,
            },
            {
              name: "city",
              label: "City (optional)",
              value: school.city ?? "",
              required: false,
            },
            {
              name: "address",
              label: "School address (optional)",
              type: "textarea",
              value: school.address ?? "",
              required: false,
              maxLength: 500,
            },
            {
              name: "contact_email",
              label: "School contact email (optional)",
              type: "email",
              value: school.contact_email ?? "",
              required: false,
              maxLength: 254,
            },
            {
              name: "tagline",
              label: "School tagline (optional)",
              value: school.tagline ?? "",
              required: false,
              maxLength: 180,
            },
            {
              name: "accent",
              label: "Portal accent colour",
              type: "color",
              value: school.accent,
            },
          ]}
          onSubmit={async (values) => {
            await api("/schools/" + school.id, "PATCH", values);
            setProfileSaved(true);
            announceSchoolUpdate();
          }}
        />
        {profileSaved && (
          <p className="live-success" role="status">
            School profile saved.
          </p>
        )}
        <p className="helper">
          Use a dark accent for readable controls. Existing published reports
          retain the school's name recorded when they were published.
        </p>
      </Card>
      <Card>
        <h2>School logo</h2>
        <div className="live-logo-editor">
          <div className="live-logo-preview">
            {preview || school.logo_object_key ? (
              <img
                src={preview || logoUrl(school)}
                alt={
                  preview
                    ? "Selected school logo preview"
                    : school.name + " logo"
                }
              />
            ) : (
              <span>LOGO</span>
            )}
          </div>
          <div>
            <label className="live-share-label">
              Choose a school logo
              <input
                aria-label="Choose a school logo"
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <p className="helper">
              PNG, JPEG or WebP · up to 1 MB · max 2048 × 2048 pixels. Uploaded
              logos are saved as a clean PNG.
            </p>
            <div className="live-buttons">
              <ActionButton
                onAction={async () => {
                  if (!file) throw Error("Choose an image first.");
                  if (file.size > 1048576)
                    throw Error("Choose a logo smaller than 1 MB.");
                  if (
                    !["image/png", "image/jpeg", "image/webp"].includes(
                      file.type,
                    )
                  )
                    throw Error("Choose a PNG, JPEG or WebP image.");
                  await api("/schools/" + school.id + "/logo", "PUT", file);
                  setFile(null);
                  if (fileInput.current) fileInput.current.value = "";
                  announceSchoolUpdate();
                  return "Your school logo has been updated.";
                }}
              >
                Upload school logo
              </ActionButton>
              {school.logo_object_key && (
                <ActionButton
                  secondary
                  onAction={async () => {
                    await api("/schools/" + school.id + "/logo", "DELETE");
                    setFile(null);
                    if (fileInput.current) fileInput.current.value = "";
                    announceSchoolUpdate();
                    return "School logo removed.";
                  }}
                >
                  Remove school logo
                </ActionButton>
              )}
            </div>
          </div>
        </div>
      </Card>
    </>
  );
}
