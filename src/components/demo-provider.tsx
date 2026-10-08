"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createDemo } from "@/lib/demo";
import type {
  Article,
  Decision,
  DemoState,
  SeedTicket,
  Ticket,
} from "@/lib/types";
type Context = {
  state: DemoState;
  seeds: SeedTicket[];
  articles: Article[];
  now: number;
  reset: () => void;
  update: (
    id: string,
    patch: Partial<Ticket>,
    action: string,
    role?: "Support rep" | "Nurse",
    detail?: Partial<Decision>,
  ) => void;
  toast: (message?: string) => void;
};
const DemoContext = createContext<Context | null>(null);
const key = "carevine-phase1-v1";
function persist(state: DemoState) {
  try {
    sessionStorage.setItem(key, JSON.stringify(state));
  } catch {
    /* The in-memory demo works when browser storage is unavailable. */
  }
}
export function DemoProvider({
  seeds,
  articles,
  children,
}: {
  seeds: SeedTicket[];
  articles: Article[];
  children: ReactNode;
}) {
  const [state, setState] = useState(() => createDemo(seeds));
  const [now, setNow] = useState(0);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const n = Date.now();
    setNow(n);
    try {
      const stored = JSON.parse(sessionStorage.getItem(key) || "null");
      if (
        stored?.tickets?.length === seeds.length &&
        stored.tickets.every(
          (t: Ticket) =>
            seeds.some((s) => s.ticket_id === t.ticket_id) &&
            t.ai &&
            typeof t.received_at === "number",
        )
      )
        setState(stored);
      else setState(createDemo(seeds, n));
    } catch {
      setState(createDemo(seeds, n));
    }
    setReady(true);
    const interval = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(interval);
  }, [seeds]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  function toast(message = "Demo: logged, not sent.") {
    setNotice(message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setNotice(""), 3500);
  }
  function update(
    id: string,
    patch: Partial<Ticket>,
    action: string,
    role: "Support rep" | "Nurse" = "Support rep",
    detail: Partial<Decision> = {},
  ) {
    const at = Date.now();
    setState((s) => {
      const next: DemoState = {
        tickets: s.tickets.map((t) =>
          t.ticket_id === id ? { ...t, ...patch } : t,
        ),
        decisions: [
          ...s.decisions,
          {
            ...detail,
            ticket_id: id,
            at,
            person: role === "Nurse" ? "Maya Brooks, RN" : "Julia Lee",
            role,
            action,
          },
        ],
      };
      persist(next);
      return next;
    });
  }
  function reset() {
    const next = createDemo(seeds, Date.now());
    persist(next);
    setState(next);
    setNow(Date.now());
    toast("Demo reset. All 16 tickets are ready.");
  }
  return (
    <DemoContext.Provider
      value={{ state, seeds, articles, now, reset, update, toast }}
    >
      <div inert={!ready} style={{ display: "contents" }}>
        {children}
      </div>
      <div
        role="status"
        aria-live="polite"
        className={`toast ${notice ? "show" : ""}`}
      >
        {notice}
      </div>
    </DemoContext.Provider>
  );
}
export function useDemo() {
  const value = useContext(DemoContext);
  if (!value) throw new Error("DemoProvider is required");
  return value;
}
