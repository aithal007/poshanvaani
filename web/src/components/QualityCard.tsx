// Data honesty: last month's readings (typed into the app later from a
// paper register) side by side with today's (spoken live at the scale).
import { useLiveQuery } from "dexie-react-hooks";
import { db, todayIso, type Measurement } from "../lib/db";
import { assessQuality, dpsBand, type QualityReport } from "../lib/quality";
import type { Phrases } from "../lib/i18n";

function Digits({ counts }: { counts: number[] }) {
  const max = Math.max(1, ...counts);
  return (
    <div className="flex items-end gap-[3px] h-14 mt-2" aria-label="Last-digit distribution of weights">
      {counts.map((c, d) => (
        <div key={d} className="flex-1 flex flex-col items-center gap-0.5">
          <div
            className={`w-full rounded-t ${d === 0 || d === 5 ? "bg-turmeric" : "bg-ink-soft"}`}
            style={{ height: `${(c / max) * 44 + 2}px` }}
            title={`.${d}: ${c}`}
          />
          <span className="text-[10px] text-slate tabular">.{d}</span>
        </div>
      ))}
    </div>
  );
}

function Column({ title, r, t, tone }: { title: string; r: QualityReport; t: Phrases; tone: string }) {
  return (
    <div className="rounded-2xl bg-paper p-3">
      <div className="text-sm font-semibold text-ink-soft">{title}</div>
      <div className={`text-5xl font-extrabold tabular leading-none mt-1 ${tone}`}>{r.score}</div>
      <div className="text-xs text-slate">/100 · n={r.n}{r.n < 20 ? ` · ${t.ui.indicative}` : ""}</div>
      <Digits counts={r.weightDigits} />
      <dl className="mt-2 text-xs space-y-0.5 tabular">
        <div className="flex justify-between"><dt>{t.ui.digitPref} (kg, adj.)</dt><dd className="font-semibold">{r.weightDps} · {dpsBand(r.weightDps)}</dd></div>
        <div className="flex justify-between"><dt>{t.ui.digitPref} (cm)</dt><dd className="font-semibold">{r.heightDps}</dd></div>
        <div className="flex justify-between"><dt>{t.ui.copied}</dt><dd className="font-semibold">{r.copiedHeights}</dd></div>
        <div className="flex justify-between"><dt>{t.ui.voiceShare}</dt><dd className="font-semibold">{Math.round(r.liveVoiceShare * 100)}%</dd></div>
      </dl>
    </div>
  );
}

const toRows = (ms: Measurement[]) =>
  ms.map((m) => ({ childId: m.childId, date: m.date, weightKg: m.weightKg, heightCm: m.heightCm, whz: m.whz, haz: m.haz, waz: m.waz, engine: m.engine, transcript: m.transcript }));

export function QualityCard({ t }: { t: Phrases }) {
  const data = useLiveQuery(async () => {
    const all = (await db.measurements.filter((m) => !m.voided).toArray()).sort((a, b) => a.takenAt - b.takenAt);
    const today = todayIso();
    const current = all.filter((m) => m.date === today);
    // "Last month": the most recent earlier reading of every child.
    const latestBefore = new Map<string, Measurement>();
    for (const m of all) if (m.date < today) latestBefore.set(m.childId, m);
    const previous = [...latestBefore.values()];
    const rows = toRows(all);
    return { before: assessQuality(toRows(previous), rows), now: assessQuality(toRows(current), rows) };
  }, []);
  if (!data) return null;
  const tone = (r: QualityReport) => (r.verdict === "trustworthy" ? "text-leaf" : r.verdict === "check" ? "text-turmeric" : "text-chilli");
  return (
    <section className="bg-sheet rounded-3xl p-5">
      <h2 className="font-bold text-lg">{t.ui.honesty}</h2>
      <p className="text-sm text-slate leading-snug">
        WHO/UNICEF &amp; SMART data-quality checks. Typed-later numbers heap on .0 and .5 (orange bars) and copy last month's height.
      </p>
      <div className="grid grid-cols-2 gap-2 mt-3">
        <Column title={t.ui.typedLater} r={data.before} t={t} tone={tone(data.before)} />
        <Column title={t.ui.spokenLive} r={data.now} t={t} tone={tone(data.now)} />
      </div>
    </section>
  );
}
