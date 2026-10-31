import {
  jsx as originalJsx,
  jsxs as originalJsxs,
  Fragment,
} from "react/jsx-runtime";
import { localize } from "./runtime";
export { Fragment };
export type { JSX } from "react/jsx-runtime";
export const jsx: typeof originalJsx = (type, props, key) =>
  originalJsx(
    type,
    localize(type, props as Record<string, unknown> | null),
    key,
  );
export const jsxs: typeof originalJsxs = (type, props, key) =>
  originalJsxs(
    type,
    localize(type, props as Record<string, unknown> | null),
    key,
  );
