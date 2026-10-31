import { jsxDEV as original, Fragment } from "react/jsx-dev-runtime";
import { localize } from "./runtime";
export { Fragment };
export type { JSX } from "react/jsx-dev-runtime";
export const jsxDEV: typeof original = (
  type,
  props,
  key,
  isStatic,
  source,
  self,
) =>
  original(
    type,
    localize(type, props as Record<string, unknown> | null),
    key,
    isStatic,
    source,
    self,
  );
