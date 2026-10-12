"use client";
import { withVisitorClock } from "@/lib/demo";
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
  sessionKey = "carevine-session-id",
  clockKey = "carevine-session-start";
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
  const [limited, setLimited] = useState(false);
  const [offline, setOffline] = useState(snapshot.offline);
  const offlineRef = useRef(snapshot.offline);
  const sessionId = useRef("");
  const [notice, setNotice] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Decision[]>([]);
  const flushing = useRef(false);
  function failLogging() {
    offlineRef.current = true;
    setOffline(true);
    pending.current = [];
  }
  function flush() {
    if (logTimer.current) clearTimeout(logTimer.current);
    logTimer.current = null;
    if (
      flushing.current ||
      offlineRef.current ||
      !pending.current.length ||
      !sessionId.current
    )
      return;
    flushing.current = true;
    const events = pending.current.splice(0, 10);
    // keepalive allows a human action to finish logging during a reload/navigation.
    void fetch("/api/decisions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId.current, events }),
      keepalive: true,
    })
      .then(async (response) => {
        const result = await response.json();
        if (result.limited) {
          offlineRef.current = true;
          pending.current = [];
          setLimited(true);
          try {
            sessionStorage.setItem("carevine-write-limited", "1");
          } catch {
            /* Storage is optional. */
          }
          toast("Demo limit reached");
          return;
        }
        if (!response.ok) {
          failLogging();
          return;
        }
        if (!result.logged) failLogging();
        else if (result.slack === "limit") toast("Demo limit reached");
        else if (result.slack === "failed")
          toast("Moved to nurse. Slack alert could not be delivered.");
      })
      .catch(failLogging)
      .finally(() => {
        flushing.current = false;
        if (pending.current.length && !offlineRef.current)
          logTimer.current = setTimeout(flush, 250);
      });
  }
  useEffect(() => {
    const n = Date.now();
    setNow(n);
    sessionId.current = randomSessionId();
    let sessionStart = n;
    let restored = initial();
    try {
      sessionId.current =
        sessionStorage.getItem(sessionKey) || sessionId.current;
      sessionStorage.setItem(sessionKey, sessionId.current);
      if (sessionStorage.getItem("carevine-write-limited") === "1") {
        offlineRef.current = true;
        setLimited(true);
      }
      const clock = Number(sessionStorage.getItem(clockKey));
      if (Number.isFinite(clock) && clock > 0 && clock <= n)
        sessionStart = clock;
      sessionStorage.setItem(clockKey, String(sessionStart));
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
        restored = stored;
      }
    } catch {
      /* Storage is optional. */
    }
    // Also migrate existing sandboxes that still contain seed-based waits.
    const next = {
      ...restored,
      tickets: withVisitorClock(restored.tickets, sessionStart),
    };
    stateRef.current = next;
    persist(next);
    setState(next);
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
      ...(action === "sent_to_nurse"
        ? {
            ticket_received_at: stateRef.current.tickets.find(
              (ticket) => ticket.ticket_id === id,
            )?.received_at,
          }
        : {}),
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
      tickets: withVisitorClock(snapshot.tickets, n),
      decisions: [],
    };
    try {
      sessionStorage.setItem(clockKey, String(n));
    } catch {
      /* The mounted visitor clock still restarts when storage is unavailable. */
    }
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
      {limited && (
        <p className="offline-note" role="status">
          Demo limit reached. You can keep exploring; new actions stay in this
          tab.
        </p>
      )}
      {offline && !limited && (
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
        aria-atomic="true"
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
export function useResetDemo() {
  const demo = useContext(DemoContext);
  return () => {
    if (demo) {
      demo.reset();
      return;
    }
    // Admin screens share the header but have no mounted demo provider.
    // Keep the visitor ID, logging limits and admin test results intact.
    try {
      sessionStorage.removeItem(key);
      sessionStorage.removeItem(clockKey);
    } catch {
      /* Returning to the demo still works when storage is unavailable. */
    }
  };
}
