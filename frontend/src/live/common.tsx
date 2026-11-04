import { useEffect, useState } from "react";
import { Form, type Field } from "../components";
import { api } from "./api";

export function useRemote<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    if (!path) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    api<T>(path, "GET", undefined, controller.signal)
      .then((value) => {
        setData(value);
        setLoading(false);
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [path, version]);
  return { data, error, loading, refresh: () => setVersion((n) => n + 1) };
}
export function RemoteForm({
  fields,
  label,
  onSubmit,
}: {
  fields: Field[];
  label: string;
  onSubmit: (v: Record<string, string>) => Promise<unknown>;
}) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  return (
    <fieldset className="live-fieldset" disabled={pending}>
      <Form
        fields={fields}
        label={pending ? "Saving…" : label}
        onSubmit={async (v) => {
          if (pending) return;
          setPending(true);
          setError("");
          setSaved(false);
          try {
            await onSubmit(v);
            setSaved(true);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setPending(false);
          }
        }}
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="live-success" role="status">
          Saved to your school workspace.
        </p>
      )}
    </fieldset>
  );
}
export function RemoteState({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: string;
  retry: () => void;
}) {
  if (error)
    return (
      <div className="card live-status" role="alert">
        <p>{error}</p>
        <button className="btn secondary" onClick={retry}>
          Try again
        </button>
      </div>
    );
  return loading ? (
    <p className="live-status" role="status">
      Loading your workspace…
    </p>
  ) : null;
}
export function ActionButton({
  children,
  onAction,
  secondary = false,
}: {
  children: React.ReactNode;
  onAction: () => Promise<unknown>;
  secondary?: boolean;
}) {
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(false);
  return (
    <div className="live-action">
      <button
        className={"btn " + (secondary ? "secondary" : "")}
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setMessage("");
          setError(false);
          try {
            const result = await onAction();
            setMessage(
              typeof result === "string" ? result : "Saved successfully.",
            );
          } catch (e) {
            setError(true);
            setMessage((e as Error).message);
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? "Please wait…" : children}
      </button>
      {message && (
        <small
          className={error ? "error" : "live-success"}
          role={error ? "alert" : "status"}
        >
          {message}
        </small>
      )}
    </div>
  );
}
export const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
