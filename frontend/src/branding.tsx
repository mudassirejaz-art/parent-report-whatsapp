import { useState } from "react";
import { ImagePlus, School, Palette } from "lucide-react";
import { useStore } from "./store";
import { Button, Card, Denied, Form } from "./components";
export function SchoolBranding() {
  const { db, session, update, notify } = useStore();
  const [logo, setLogo] = useState(db.school.logoUrl || "");
  const [accent, setAccent] = useState(db.school.accent || "#087f75");
  const [error, setError] = useState("");
  if (session?.role !== "school_admin") return <Denied />;
  const colours = [
    { value: "#087f75", label: "Teal · ParentReport" },
    { value: "#244e78", label: "Academic blue" },
    { value: "#694c91", label: "Royal purple" },
    { value: "#9a5d22", label: "Warm bronze" },
  ];
  function upload(file?: File) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError(
        "Choose a PNG, JPEG or WebP image. SVG files are not supported.",
      );
      return;
    }
    if (file.size > 200 * 1024) {
      setError(
        "Choose a logo smaller than 200 KB so it fits comfortably in demo storage.",
      );
      return;
    }
    const reader = new FileReader();
    reader.onerror = () =>
      setError("We could not read this image. Try another file.");
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => setError("This file is not a valid image.");
      image.onload = () => {
        setLogo(String(reader.result));
        setError("");
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }
  return (
    <>
      <Card>
        <h2>Your school identity</h2>
        <p className="muted">
          Your name and details appear throughout your staff and parent portals
          and on sample report cards.
        </p>
        <Form
          fields={[
            { name: "name", label: "School name", value: db.school.name },
            { name: "city", label: "City", value: db.school.city },
            {
              name: "tagline",
              label: "School tagline",
              value: db.school.tagline || "Learning today. Leading tomorrow.",
            },
            {
              name: "address",
              label: "School address",
              value: db.school.address || "Demo campus, Lahore",
            },
            {
              name: "contactEmail",
              label: "School contact email",
              value: db.school.contactEmail || "school@example.test",
              type: "email",
            },
          ]}
          label="Save school identity"
          onSubmit={(v) => {
            if (session?.role !== "school_admin") return;
            update((d) => Object.assign(d.school, v));
            notify("School identity updated across all portals");
          }}
        />
      </Card>
      <Card>
        <div className="section-head">
          <div>
            <h2>Logo & portal appearance</h2>
            <p className="muted">
              Upload your own school logo and choose a professional accent.
            </p>
          </div>
          <Palette size={24} />
        </div>
        <div className="branding-editor">
          <div className="logo-editor">
            {logo ? (
              <img
                className="logo-upload-preview"
                src={logo}
                alt="School logo preview"
              />
            ) : (
              <span className="logo-placeholder">
                <School size={40} />
              </span>
            )}
            <label className="file-upload">
              <ImagePlus size={18} />
              Choose school logo
              <input
                type="file"
                aria-label="Upload school logo"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => upload(e.target.files?.[0])}
              />
            </label>
            <small>PNG, JPEG or WebP · maximum 200 KB · stored locally</small>
            {logo && (
              <Button secondary onClick={() => setLogo("")}>
                Remove logo
              </Button>
            )}
          </div>
          <div>
            <label className="scope-picker">
              Portal accent
              <select
                aria-label="Portal accent"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
              >
                {colours.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <div
              className="branding-preview"
              style={{ borderTopColor: accent }}
            >
              <div className="person">
                {logo ? (
                  <img src={logo} alt="Brand preview logo" />
                ) : (
                  <School style={{ color: accent }} size={35} />
                )}
                <div>
                  <h3>{db.school.name}</h3>
                  <p>
                    {db.school.tagline || "Learning today. Leading tomorrow."}
                  </p>
                </div>
              </div>
              <span
                className="brand-preview-button"
                style={{ background: accent }}
              >
                Your parent portal
              </span>
              <small>Powered by ParentReport · Demo preview</small>
            </div>
          </div>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <Button
          onClick={() => {
            if (session?.role !== "school_admin") return;
            update((d) => {
              d.school.logoUrl = logo || undefined;
              d.school.accent = accent;
            });
            notify("Logo and portal appearance saved");
          }}
        >
          Save portal appearance
        </Button>
      </Card>
    </>
  );
}
