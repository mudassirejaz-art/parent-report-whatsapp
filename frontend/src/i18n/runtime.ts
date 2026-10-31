import { translate } from "./catalog";
import { getLanguage } from "./state";
export function localize(type: unknown, props: Record<string, unknown> | null) {
  if (
    !props ||
    typeof type !== "string" ||
    props.translate === "no" ||
    String(props.className || "")
      .split(" ")
      .includes("notice-body")
  )
    return props;
  const next = { ...props };
  const tr = (value: unknown): unknown =>
    typeof value === "string"
      ? translate(value, getLanguage())
      : Array.isArray(value)
        ? value.map(tr)
        : value;
  next.children = tr(props.children);
  for (const name of ["placeholder", "title", "aria-label"])
    if (typeof props[name] === "string") next[name] = tr(props[name]);
  return next;
}
