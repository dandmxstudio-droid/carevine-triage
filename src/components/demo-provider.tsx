"use client";
import { randomSessionId } from "@/lib/session";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  Article,
  Decision,
  DemoSnapshot,
  DemoState,
  SeedTicket,
  Ticket,
} from "@/lib/types";
type Context = {
  state: DemoState;
  seeds: SeedTicket[];
  articles: Article[];
  now: number;
  loadedAt: number;
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
const key = "carevine-phase2-v1",
  sessionKey = "carevine-session-id";
function persist(state: DemoState) {
  try {
    sessionStorage.setItem(key, JSON.stringify(state));
  } catch {
    /* In-memory sandbox remains usable. */
  }
}
export function DemoProvider({
  seeds,
  articles,
  snapshot,
  children,
}: {
  seeds: SeedTicket[];
  articles: Article[];
  snapshot: DemoSnapshot;
  children: ReactNode;
}) {
  const initial = (): DemoState => ({
    tickets: structuredClone(snapshot.tickets),
    decisions: [],
  });
  const [state, setState] = useState(initial);
  const stateRef = useRef(state);
  const [now, setNow] = useState(0);
  const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(snapshot.offline);
  const offlineRef = useRef(snapshot.offline);
  const sessionId = useRef("");
  const [notice, setNotice] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Decision[]>([]);
  function failLogging() {
    offlineRef.current = true;
    setOffline(true);
    pending.current = [];
  }
  function flush() {
    if (logTimer.current) clearTimeout(logTimer.current);
    logTimer.current = null;
    if (offlineRef.current || !pending.current.length || !sessionId.current)
      return;
    const events = pending.current.splice(0, 10);
    // keepalive allows a human action to finish logging during a reload/navigation.
    void fetch("/api/decisions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId.current, events }),
      keepalive: true,
    })
      .then(async (response) => {
        if (!response.ok || !(await response.json()).logged) failLogging();
      })
      .catch(failLogging);
    if (pending.current.length) logTimer.current = setTimeout(flush, 250);
  }
  useEffect(() => {
    const n = Date.now();
    setNow(n);
    sessionId.current = randomSessionId();
    try {
      sessionId.current =
        sessionStorage.getItem(sessionKey) || sessionId.current;
      sessionStorage.setItem(sessionKey, sessionId.current);
      const stored = JSON.parse(sessionStorage.getItem(key) || "null");
      if (
        stored?.tickets?.length === seeds.length &&
        Array.isArray(stored.decisions) &&
        stored.tickets.every(
          (t: Ticket) =>
            seeds.some((s) => s.ticket_id === t.ticket_id) &&
            t.ai &&
            typeof t.received_at === "number",
        )
      ) {
        stateRef.current = stored;
        setState(stored);
      }
    } catch {
      /* Storage is optional. */
    }
    setReady(true);
    const interval = setInterval(() => setNow(Date.now()), 15000); // Local clock only; no data polling.
    const onHide = () => flush();
    window.addEventListener("pagehide", onHide);
    return () => {
      clearInterval(interval);
      window.removeEventListener("pagehide", onHide);
      flush();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
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
    const { gap, ...values } = detail;
    const event: Decision = {
      ...values,
      ticket_id: id,
      at,
      person: role === "Nurse" ? "Maya Brooks, RN" : "Julia Lee",
      role,
      action,
    };
    const events = [event];
    if (gap)
      events.push({
        ticket_id: id,
        at,
        person: event.person,
        role,
        action: "gap_flagged",
        note: gap.text,
        gap,
      });
    const next: DemoState = {
      tickets: stateRef.current.tickets.map((t) =>
        t.ticket_id === id ? { ...t, ...patch } : t,
      ),
      decisions: [...stateRef.current.decisions, ...events],
    };
    stateRef.current = next;
    persist(next);
    setState(next);
    // Side effects stay outside React state updaters, avoiding duplicate logs in Strict Mode.
    if (!offlineRef.current) {
      pending.current.push(...events);
      if (!logTimer.current) logTimer.current = setTimeout(flush, 250);
    }
  }
  function reset() {
    const n = Date.now();
    const next: DemoState = {
      tickets: structuredClone(snapshot.tickets).map((t) => ({
        ...t,
        received_at: n - t.demo_wait_min * 60000,
        moved_at:
          t.queue === "Nurse" && t.ai.priority === "urgent"
            ? n - t.demo_wait_min * 60000
            : null,
      })),
      decisions: [],
    };
    stateRef.current = next;
    persist(next);
    setState(next);
    setNow(n);
    toast("Demo reset. All 16 tickets are ready.");
  }
  return (
    <DemoContext.Provider
      value={{
        state,
        seeds,
        articles,
        now,
        loadedAt: snapshot.loaded_at,
        reset,
        update,
        toast,
      }}
    >
      {offline && (
        <p className="offline-note" role="status">
          Demo running offline. Actions aren&apos;t being logged.
        </p>
      )}
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
