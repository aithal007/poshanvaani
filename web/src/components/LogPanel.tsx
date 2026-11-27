// "What the app heard and decided": a transparent trace shown beside the
// phone on wide screens, so a supervisor (or a judge) can see every turn.
import { useEffect, useRef } from "react";
import type { LogEntry } from "../hooks/useWeighing";

const WHO = { worker: "Worker", app: "PoshanVaani", system: "System" } as const;
const TONE = { worker: "text-ink", app: "text-leaf", system: "text-slate" } as const;

export function LogPanel({ log, phase }: { log: LogEntry[]; phase: string }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [log.length]);
  return (
    <aside className="bg-sheet rounded-3xl p-5 h-full flex flex-col min-h-0">
      <div className="flex items-baseline justify-between">
        <h2 className="font-bold text-lg">Conversation trace</h2>
        <span className="text-sm text-slate">state: <b className="text-ink">{phase}</b></span>
      </div>
      <p className="text-sm text-slate">Speech is transcribed by the engine; every decision below is made by deterministic code.</p>
      <ol className="mt-3 space-y-2 overflow-y-auto flex-1 min-h-0 pr-1">
        {log.map((e, i) => (
          <li key={i} className="text-sm leading-snug">
            <span className={`font-semibold ${TONE[e.who]}`}>{WHO[e.who]}</span>{" "}
            <span className="text-slate tabular">{new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
            <div className={e.who === "worker" ? "text-base font-semibold" : ""}>{e.text}</div>
            {e.detail && <div className="text-xs text-slate">{e.detail}</div>}
          </li>
        ))}
        <div ref={end} />
      </ol>
    </aside>
  );
}
