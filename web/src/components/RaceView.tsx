// Typing vs voice: a stopwatch over a typical data-entry form (the way
// readings are entered today) compared with the measured time per child
// of today's voice entries. Real numbers only: nothing is simulated.
import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, todayIso, type Child } from "../lib/db";
import type { Phrases } from "../lib/i18n";

const KEY = "pv.race";

export function loadRaces(): number[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as number[];
  } catch {
    return [];
  }
}

function saveRace(ms: number) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...loadRaces(), ms].slice(-20)));
  } catch {
    /* not remembered in private mode */
  }
}

export const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
export const secs = (ms: number | null) => (ms === null ? "—" : `${(ms / 1000).toFixed(1)} s`);

/** Average seconds per child for today's voice entries. */
export function useVoiceTimes() {
  return useLiveQuery(
    async () =>
      (await db.measurements.where("date").equals(todayIso()).toArray())
        .filter((m) => !m.voided && m.engine !== "manual" && m.durationMs)
        .map((m) => m.durationMs!),
    [],
    [] as number[]
  );
}

export function RaceView({ roster, t, onClose }: { roster: Child[]; t: Phrases; onClose: () => void }) {
  const [start, setStart] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [done, setDone] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [childId, setChildId] = useState("");
  const [w, setW] = useState("");
  const [h, setH] = useState("");
  const [lying, setLying] = useState("");
  const [date, setDate] = useState(todayIso());
  const timer = useRef<number>(0);
  const voice = useVoiceTimes();

  useEffect(() => {
    if (start === null || done !== null) return;
    timer.current = window.setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer.current);
  }, [start, done]);

  const begin = () => {
    if (start === null) {
      setStart(Date.now());
      setNow(Date.now());
    }
  };
  const elapsed = done ?? (start ? now - start : 0);
  const matches = query.length >= 2 ? roster.filter((c) => c.name.toLowerCase().includes(query.toLowerCase())).slice(0, 4) : [];
  const valid = childId && Number(w) > 0 && Number(h) > 0 && lying && date;
  const voiceAvg = avg(voice);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || start === null) return;
    const ms = Date.now() - start;
    setDone(ms);
    saveRace(ms);
  };

  const reset = () => {
    setStart(null);
    setDone(null);
    setQuery("");
    setChildId("");
    setW("");
    setH("");
    setLying("");
  };

  return (
    <div className="fixed inset-0 z-30 bg-paper overflow-y-auto" role="dialog" aria-modal="true" aria-label={t.ui.race}>
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-extrabold">{t.ui.race}</h2>
          <button type="button" onClick={onClose} className="px-3 py-1 text-slate">{t.ui.cancel}</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-sheet rounded-3xl p-4 text-center">
            <div className="text-sm font-semibold text-slate">{t.ui.typingTime}</div>
            <div className={`text-6xl font-extrabold tabular ${done ? "text-chilli" : ""}`}>{(elapsed / 1000).toFixed(1)}<span className="text-2xl"> s</span></div>
            <div className="text-xs text-slate">{done ? "" : start ? "…" : "starts on first tap"}</div>
          </div>
          <div className="bg-sheet rounded-3xl p-4 text-center">
            <div className="text-sm font-semibold text-slate">{t.ui.voiceTime} · {t.ui.perChild}</div>
            <div className="text-6xl font-extrabold tabular text-leaf">{voiceAvg === null ? "—" : (voiceAvg / 1000).toFixed(1)}<span className="text-2xl"> s</span></div>
            <div className="text-xs text-slate">average of today's {voice.length} voice entries (measured)</div>
          </div>
        </div>
        {done && voiceAvg && (
          <p className="text-center text-2xl font-bold">
            Voice was {(done / voiceAvg).toFixed(1)}× faster, with hands free for the child.
          </p>
        )}

        <form onSubmit={submit} onFocus={begin} onPointerDown={begin} className="bg-sheet rounded-3xl p-5 space-y-3 border-2 border-rule">
          <div className="text-sm text-slate">Growth monitoring entry form (typical of today's apps)</div>
          <label className="block">
            <span className="text-sm font-semibold">Search beneficiary</span>
            <input value={query} onChange={(e) => { setQuery(e.target.value); setChildId(""); }} className="w-full border-2 border-rule rounded-lg px-3 py-2" placeholder="Type at least 2 letters" />
          </label>
          {matches.length > 0 && !childId && (
            <ul className="border border-rule rounded-lg divide-y divide-rule">
              {matches.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => { setChildId(c.id); setQuery(c.name); }} className="w-full text-left px-3 py-2">
                    {c.name} <span className="text-slate text-sm">({c.parentName})</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-semibold">Date of measurement</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full border-2 border-rule rounded-lg px-3 py-2" />
            </label>
            <fieldset>
              <legend className="text-sm font-semibold">Measured</legend>
              <label className="mr-3"><input type="radio" name="pos" value="lying" checked={lying === "lying"} onChange={(e) => setLying(e.target.value)} /> Lying</label>
              <label><input type="radio" name="pos" value="standing" checked={lying === "standing"} onChange={(e) => setLying(e.target.value)} /> Standing</label>
            </fieldset>
            <label className="block">
              <span className="text-sm font-semibold">Weight (kg)</span>
              <input inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} className="w-full border-2 border-rule rounded-lg px-3 py-2" />
            </label>
            <label className="block">
              <span className="text-sm font-semibold">Height / length (cm)</span>
              <input inputMode="decimal" value={h} onChange={(e) => setH(e.target.value)} className="w-full border-2 border-rule rounded-lg px-3 py-2" />
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={!valid || done !== null} className="flex-1 rounded-xl bg-ink text-sheet font-bold py-3 disabled:opacity-40">Submit</button>
            <button type="button" onClick={reset} className="rounded-xl border-2 border-ink px-4 font-semibold">Reset</button>
          </div>
        </form>
        <p className="text-sm text-slate">Typed runs so far: {loadRaces().map((ms) => secs(ms)).join(", ") || "none"}.</p>
      </div>
    </div>
  );
}
