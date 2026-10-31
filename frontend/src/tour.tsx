import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Player } from "@remotion/player";
import { Link } from "react-router-dom";
import {
  PanelTop,
  GraduationCap,
  HeartHandshake,
  Check,
  ArrowRight,
} from "lucide-react";
import { PageTitle, Card } from "./components";
import { Logo } from "./layouts";
export function TourComposition() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scene = Math.min(2, Math.floor(frame / (fps * 6.66)));
  const local = frame - scene * fps * 6.66;
  const data = [
    {
      k: "01 · SCHOOL ADMIN",
      title: "A space for every class.",
      subtitle: "Activate a portal. Assign the right teacher.",
      name: "Class 6-A",
      detail: "Amina Siddiqui · 2026–27",
      status: "Portal activated",
      Icon: PanelTop,
    },
    {
      k: "02 · CLASS TEACHER",
      title: "Let progress take shape.",
      subtitle: "Record marks. Verify guardians. Preview reports.",
      name: "October assessment",
      detail: "Mathematics 88 · English 85 · Science 82",
      status: "Verified & consented · Ready to share",
      Icon: GraduationCap,
    },
    {
      k: "03 · PARENT",
      title: "A little closer to home.",
      subtitle: "A private window into their learning journey.",
      name: "Ahmed Hassan",
      detail: "October assessment · Overall score 85%",
      status: "Your child. Your private report.",
      Icon: HeartHandshake,
    },
  ][scene];
  return (
    <AbsoluteFill
      style={{
        background: "#f6f8f6",
        fontFamily: "Arial,sans-serif",
        padding: 65,
        color: "#182d38",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <strong style={{ fontSize: 27 }}>
          ▣ Parent<span style={{ color: "#087f75" }}>Report</span>
        </strong>
        <span style={{ fontSize: 17, color: "#64746d" }}>
          School & home, connected.
        </span>
      </div>
      <div
        style={{
          opacity: interpolate(local, [0, fps * 0.6], [0, 1], {
            extrapolateRight: "clamp",
            extrapolateLeft: "clamp",
          }),
          translate: `0 ${interpolate(local, [0, fps * 0.8], [25, 0], { extrapolateRight: "clamp", extrapolateLeft: "clamp" })}px`,
          marginTop: 65,
        }}
      >
        <div
          style={{
            fontSize: 17,
            color: "#087f75",
            fontWeight: 700,
            letterSpacing: 3,
          }}
        >
          {data.k}
        </div>
        <h1 style={{ fontSize: 53, letterSpacing: -2, margin: "20px 0" }}>
          {data.title}
        </h1>
        <p style={{ fontSize: 22, color: "#687c78" }}>{data.subtitle}</p>
        <div
          style={{
            background: "white",
            padding: 34,
            border: "1px solid #dde8e1",
            borderRadius: 20,
            marginTop: 32,
            display: "flex",
            alignItems: "center",
            gap: 25,
            boxShadow: "0 16px 50px #182d3809",
          }}
        >
          <div
            style={{
              padding: 20,
              background: "#e5f5ef",
              borderRadius: 15,
              color: "#087f75",
            }}
          >
            <data.Icon size={46} />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 29, margin: "0 0 12px" }}>{data.name}</h2>
            <p style={{ fontSize: 18, color: "#687c78" }}>{data.detail}</p>
            <span
              style={{
                color: "#087f75",
                fontSize: 17,
                display: "flex",
                gap: 10,
                alignItems: "center",
              }}
            >
              <Check size={20} />
              {data.status}
            </span>
          </div>
          {scene === 2 && (
            <strong style={{ fontSize: 62, color: "#087f75" }}>
              85<span style={{ fontSize: 28 }}>%</span>
            </strong>
          )}
        </div>
      </div>
      <div
        style={{
          marginTop: "auto",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        {["Activate class", "Record progress", "Connect home"].map((s, i) => (
          <div key={s} style={{ flex: 1 }}>
            <div
              style={{
                height: 4,
                background: i <= scene ? "#087f75" : "#dce6df",
                borderRadius: 5,
                marginBottom: 15,
              }}
            />
            <span
              style={{
                fontSize: 16,
                color: i === scene ? "#087f75" : "#7a8c86",
              }}
            >
              {s}
            </span>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12, color: "#6b7d77", marginBottom: 0 }}>
        Frontend demo · Simulated verification and messaging · No WhatsApp
        messages are sent
      </p>
    </AbsoluteFill>
  );
}
export function Tour() {
  return (
    <div className="tour-page">
      <Logo />
      <PageTitle
        eyebrow="THE PARENTREPORT STORY · 20 SECONDS"
        title="From classroom to connection."
        description="Follow a school admin, a class teacher, and a parent through one connected journey."
      />
      <Card>
        <Player
          component={TourComposition}
          durationInFrames={600}
          compositionWidth={1100}
          compositionHeight={720}
          fps={30}
          controls
          style={{ width: "100%", borderRadius: 14 }}
          autoPlay={false}
          acknowledgeRemotionLicense
        />
      </Card>
      <div className="tour-steps">
        {[
          {
            n: "01",
            title: "Launch a class",
            text: "Admin activates the portal and assigns a teacher.",
          },
          {
            n: "02",
            title: "Record the progress",
            text: "Teacher enters marks and previews eligible reports.",
          },
          {
            n: "03",
            title: "Bring it home",
            text: "Verified parents privately see their child’s results.",
          },
        ].map((s) => (
          <Card key={s.n}>
            <small>{s.n}</small>
            <h3>{s.title}</h3>
            <p>{s.text}</p>
          </Card>
        ))}
      </div>
      <Link className="btn" to="/">
        Explore the demo <ArrowRight size={18} />
      </Link>
    </div>
  );
}
