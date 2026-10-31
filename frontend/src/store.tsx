import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { repository } from "./services";
import type { DB, Session } from "./types";
type Store = {
  db: DB;
  session: Session | null;
  setSession: (s: Session | null) => void;
  update: (fn: (d: DB) => void) => void;
  reset: () => void;
  notify: (s: string) => void;
};
const Context = createContext<Store>(null!);
export const useStore = () => useContext(Context);

export function Provider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DB>(() => repository.load());
  const [session, setSessionState] = useState<Session | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem("pr-session") || "null");
    } catch {
      return null;
    }
  });
  const [toast, setToast] = useState("");
  useEffect(() => {
    function sync(e: StorageEvent) {
      if (e.key === "parentreport-fictional-demo-v1") setDb(repository.load());
    }
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  function notify(s: string) {
    setToast(s);
    window.setTimeout(() => setToast(""), 4500);
  }
  function update(fn: (d: DB) => void) {
    setDb((prev) => {
      const next = structuredClone(prev);
      fn(next);
      repository.commit(next);
      return next;
    });
  }
  function setSession(s: Session | null) {
    setSessionState(s);
    sessionStorage.setItem("pr-session", JSON.stringify(s));
  }
  return (
    <Context.Provider
      value={{
        db,
        session,
        setSession,
        update,
        notify,
        reset: () => {
          const d = repository.reset();
          setDb(d);
          for (const key of Object.keys(sessionStorage))
            if (
              key.startsWith("pr-draft-") ||
              key.startsWith("pr-message-draft-")
            )
              sessionStorage.removeItem(key);
          notify("Sample data reset");
        },
      }}
    >
      {children}
      {toast && (
        <div className="toast" role="status">
          ✓ {toast}
        </div>
      )}
    </Context.Provider>
  );
}
