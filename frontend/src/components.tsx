import { useEffect, useRef, type ReactNode, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { X, ArrowUpRight, ShieldCheck, Inbox } from "lucide-react";
export function Badge({ children }: { children: ReactNode }) {
  return (
    <span
      className={"badge " + String(children).toLowerCase().replaceAll(" ", "-")}
    >
      {children}
    </span>
  );
}
export function Button({
  children,
  onClick,
  disabled = false,
  secondary = false,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  secondary?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      className={"btn " + (secondary ? "secondary" : "")}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
export function PageTitle({
  eyebrow = "YOUR SCHOOL, CONNECTED",
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </div>
      <div className="heading-actions">{action}</div>
    </div>
  );
}
export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={"card " + className}>{children}</section>;
}
export function Empty({
  title = "Nothing here yet",
  children,
}: {
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <Inbox size={34} />
      <h3>{title}</h3>
      <p>{children || "Your next step will appear here."}</p>
    </div>
  );
}
export function Denied({
  title = "Access restricted",
  message = "This workspace is not available for your current demo account.",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <Card>
      <div className="empty">
        <ShieldCheck size={46} />
        <h1>{title}</h1>
        <p>{message}</p>
        <Link className="btn" to="/">
          Choose a demo role <ArrowUpRight size={16} />
        </Link>
      </div>
    </Card>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    const first = ref.current?.querySelector<HTMLElement>(
      "input,button,select",
    );
    first?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const els = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            "button,input,select,textarea,a[href]",
          ) || [],
        ).filter((el) => !el.hasAttribute("disabled"));
        if (e.shiftKey && document.activeElement === els[0]) {
          e.preventDefault();
          els.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === els.at(-1)) {
          e.preventDefault();
          els[0]?.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      old?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
      >
        <div className="section-head">
          <h2>{title}</h2>
          <button
            className="icon-btn"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export type Field = {
  name: string;
  label: string;
  value?: string;
  type?: string;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  required?: boolean;
  maxLength?: number;
};
export function Form({
  fields,
  onSubmit,
  label = "Save changes",
  children,
}: {
  fields: Field[];
  onSubmit: (data: Record<string, string>) => void;
  label?: string;
  children?: ReactNode;
}) {
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const inputs = Array.from(
      form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        "input[required],textarea[required]",
      ),
    );
    for (const input of inputs) {
      input.setCustomValidity(
        input.value.trim() ? "" : "Please enter a value.",
      );
      if (!input.reportValidity()) {
        input.addEventListener("input", () => input.setCustomValidity(""), {
          once: true,
        });
        return;
      }
    }
    onSubmit(Object.fromEntries(new FormData(form)) as Record<string, string>);
  }
  return (
    <form className="form" onSubmit={submit}>
      {fields.map((f) => (
        <label key={f.name}>
          {f.label}
          {f.options ? (
            <select
              aria-label={f.label}
              name={f.name}
              defaultValue={f.value}
              required={f.required !== false}
            >
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : f.type === "textarea" ? (
            <textarea
              aria-label={f.label}
              name={f.name}
              defaultValue={f.value}
              required={f.required !== false}
              maxLength={f.maxLength ?? 2000}
              rows={4}
            />
          ) : (
            <input
              aria-label={f.label}
              name={f.name}
              type={f.type || "text"}
              defaultValue={f.value}
              min={f.min}
              max={f.max}
              required={f.required !== false}
              maxLength={f.maxLength ?? 120}
            />
          )}
        </label>
      ))}
      {children}
      <Button type="submit">{label}</Button>
    </form>
  );
}
export function DemoNotice() {
  return (
    <div className="demo-notice">
      <ShieldCheck size={16} />
      <span>
        <strong>Demo environment.</strong> Fictional data · simulated access and
        verification · no real messages.
      </span>
    </div>
  );
}
