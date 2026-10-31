import { useSyncExternalStore } from "react";
import type { Language } from "./catalog";
const key = "parentreport-reading-language";
let language: Language =
  typeof localStorage !== "undefined" && localStorage.getItem(key) === "ur-Latn"
    ? "ur-Latn"
    : "en";
const listeners = new Set<() => void>();
export const getLanguage = (): Language => {
  try {
    return localStorage.getItem(key) === "ur-Latn" ? "ur-Latn" : "en";
  } catch {
    return language;
  }
};
export function setLanguage(value: Language) {
  language = value;
  localStorage.setItem(key, value);
  document.documentElement.lang = value;
  document.documentElement.dir = "ltr";
  listeners.forEach((fn) => fn());
}
export function useLanguage() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    getLanguage,
    () => "en" as Language,
  );
}
