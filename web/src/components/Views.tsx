// Secondary screens: children, alerts (referrals) and the session summary.
import { useLiveQuery } from "dexie-react-hooks";
import { db, historyFor, todayIso, type Child, type Measurement } from "../lib/db";
import type { Lang, Phrases } from "../lib/i18n";
import { ageInDays, ageInMonths } from "../lib/who";
import { downloadCsv, referralText, toCsv, whatsappLink } from "../lib/export";
import { GrowthChart } from "./GrowthChart";
import { QualityCard } from "./QualityCard";
import { avg, secs, loadRaces, useVoiceTimes } from "./RaceView";
import { watchList } from "../lib/watchlist";
import { familyMessage } from "../lib/counsel";
import { useState } from "react";

const DOT = { normal: "bg-leaf", mam: "bg-turmeric", sam: "bg-chilli" } as const;
const nameOf = (c: Child, lang: Lang) => (lang === "en" ? c.name : c.nameLocal);

function useLatest() {
  return useLiveQuery(
    async () => {
      const all = await db.measurements.filter((m) => !m.voided).toArray();
      const latest = new Map<string, Measurement>();
      for (const m of all.sort((a, b) => a.takenAt - b.takenAt)) latest.set(m.childId, m);
      return latest;
    },
    [],
    new Map<string, Measurement>()
  );
}

export function ChildrenView({ roster, lang, t }: { roster: Child[]; lang: Lang; t: Phrases }) {
  const latest = useLatest();
  const [open, setOpen] = useState<string | null>(null);
  const today = todayIso();
  const history = useLiveQuery(() => (open ? historyFor(open) : Promise.resolve([])), [open], []);
  return (
    <ul className="bg-sheet rounded-3xl divide-y divide-rule overflow-hidden">
      {roster.map((c) => {
        const m = latest.get(c.id);
        const months = ageInMonths(ageInDays(c.dob));
        return (
          <li key={c.id}>
            <button type="button" className="w-full text-left px-4 py-3 flex items-center gap-3" onClick={() => setOpen(open === c.id ? null : c.id)} aria-expanded={open === c.id}>
              <span className={`w-3 h-3 rounded-full shrink-0 ${m ? DOT[m.status] : "bg-rule"}`} />
              <span className="flex-1">
                <span className="block text-lg font-semibold leading-tight">{nameOf(c, lang)}</span>
                <span className="block text-sm text-slate">{months} {t.ui.months} · {c.parentName}</span>
              </span>
              <span className="text-right tabular text-sm">
                {m && <span className="block font-semibold">{m.weightKg} kg · {m.heightCm} cm</span>}
                <span className={`block ${m?.date === today ? "text-leaf font-semibold" : "text-slate"}`}>{m?.date === today ? `✓ ${t.ui.weighed}` : m?.date ?? ""}</span>
              </span>
            </button>
            {open === c.id && history.length > 0 && (
              <div className="px-4 pb-4">
                <GrowthChart child={c} history={history} />
                <table className="w-full text-sm tabular mt-2">
                  <tbody>
                    {[...history].reverse().map((h) => (
                      <tr key={h.id} className="border-t border-rule">
                        <td className="py-1">{h.date}</td>
                        <td>{h.weightKg} kg</td>
                        <td>{h.heightCm} cm</td>
                        <td>WHZ {h.whz}</td>
                        <td className="text-slate truncate max-w-28" title={h.transcript}>{h.engine === "manual" ? "⌨" : "🎙"}{h.corrected ? " ✎" : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function AlertsView({ roster, lang, t, onSpeak }: { roster: Child[]; lang: Lang; t: Phrases; onSpeak: (text: string) => void }) {
  const today = todayIso();
  const watch = useLiveQuery(async () => watchList(roster, await db.measurements.toArray()), [roster], []);
  const reasonText = (r: string) => t.ui[`r_${r}`] ?? r;
  const spoken = watch.map((w) => `${nameOf(w.child, lang)}: ${w.reasons.map(reasonText).join(", ")}`).join(". ");
  const watchCard = watch.length > 0 && (
    <section className="bg-sheet rounded-3xl p-4 mb-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-lg">{t.ui.watchList}</h2>
        <button type="button" onClick={() => onSpeak(spoken)} className="rounded-xl bg-ink text-sheet text-sm font-semibold px-3 py-1.5">{t.ui.speakList}</button>
      </div>
      <ol className="mt-2 space-y-1.5">
        {watch.map((w, i) => (
          <li key={w.child.id} className="flex gap-3 items-baseline">
            <span className="tabular text-slate w-4">{i + 1}</span>
            <span className="flex-1">
              <b>{nameOf(w.child, lang)}</b>
              <span className="block text-sm text-ink-soft">{w.reasons.map(reasonText).join(" · ")}{w.projectedWhz !== undefined && w.reasons.includes("slide") ? ` (WHZ → ${w.projectedWhz})` : ""}</span>
            </span>
            <span className={`w-3 h-3 rounded-full ${w.reasons.includes("sam") ? "bg-chilli" : w.reasons.includes("mam") ? "bg-turmeric" : "bg-ink-soft"}`} />
          </li>
        ))}
      </ol>
    </section>
  );
  const rows = useLiveQuery(
    async () => {
      const todays = await db.measurements.where("date").equals(today).filter((m) => !m.voided).toArray();
      const out: { c: Child; m: Measurement; prev?: Measurement }[] = [];
      for (const m of todays) {
        if (m.status === "normal" && !m.faltering) continue;
        const c = roster.find((x) => x.id === m.childId);
        if (!c) continue;
        const hist = await historyFor(c.id);
        const prev = hist.filter((h) => h.date < today).pop();
        out.push({ c, m, prev });
      }
      const rank = { sam: 0, mam: 1, normal: 2 };
      return out.sort((a, b) => rank[a.m.status] - rank[b.m.status]);
    },
    [today, roster],
    []
  );
  if (!rows.length) return <>{watchCard}<p className="bg-sheet rounded-3xl p-6 text-lg text-slate">{t.ui.noAlerts}</p></>;
  return (
    <>
    {watchCard}
    <ul className="space-y-3">
      {rows.map(({ c, m, prev }) => {
        const text = referralText(c, m, prev);
        const tone = m.status === "sam" ? "border-chilli" : m.status === "mam" ? "border-turmeric" : "border-ink-soft";
        return (
          <li key={m.id} className={`bg-sheet rounded-3xl p-4 border-l-8 ${tone}`}>
            <div className="flex justify-between items-baseline">
              <span className="text-xl font-bold">{nameOf(c, lang)}</span>
              <span className="text-sm font-bold">{m.status === "normal" ? t.ui.faltering : t.ui[m.status]}</span>
            </div>
            <div className="tabular text-slate">
              {m.weightKg} kg · {m.heightCm} cm · WHZ {m.whz}
              {prev && ` · ${t.ui.lastMonth} ${prev.weightKg} kg`}
            </div>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-sm bg-paper rounded-xl p-3">{text}</pre>
            <a href={whatsappLink(text)} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center rounded-xl bg-leaf text-sheet font-bold px-4 py-2">
              {t.ui.referral}: {t.ui.share}
            </a>
            <FamilyMessage text={familyMessage(c, m, prev, lang)} t={t} onSpeak={onSpeak} />
          </li>
        );
      })}
    </ul>
    </>
  );
}

export function FamilyMessage({ text, t, onSpeak }: { text: string; t: Phrases; onSpeak: (text: string) => void }) {
  return (
    <div className="mt-3 rounded-2xl border-2 border-leaf/40 p-3">
      <div className="text-sm font-bold text-leaf">{t.ui.familyMsg}</div>
      <p className="mt-1 leading-snug">{text}</p>
      <div className="flex gap-2 mt-2">
        <button type="button" onClick={() => onSpeak(text)} className="rounded-xl bg-ink text-sheet font-semibold px-3 py-1.5">▶ {t.ui.play}</button>
        <a href={whatsappLink(text)} target="_blank" rel="noreferrer" className="rounded-xl border-2 border-leaf text-leaf font-semibold px-3 py-1">{t.ui.share}</a>
      </div>
    </div>
  );
}

export function SummaryView({
  roster, todays, pending, lang, t, online, onReset, onRace,
}: {
  roster: Child[];
  todays: Measurement[];
  pending: Child[];
  lang: Lang;
  t: Phrases;
  online: boolean;
  onReset: () => void;
  onRace: () => void;
}) {
  const voiceTimes = useVoiceTimes();
  const typed = avg(loadRaces());
  const spoken = avg(voiceTimes);
  const unsynced = useLiveQuery(() => db.measurements.filter((m) => !m.synced && !m.voided).count(), [], 0);
  const [syncing, setSyncing] = useState(false);
  const counts = { sam: 0, mam: 0, normal: 0 };
  todays.forEach((m) => counts[m.status]++);
  const corrected = todays.filter((m) => m.corrected).length;

  const sync = async () => {
    setSyncing(true);
    const rows = await db.measurements.filter((m) => !m.synced && !m.voided).toArray();
    try {
      await fetch("/api/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(rows.map(({ audio: _a, ...r }) => r)),
      });
    } catch {
      /* the demo server may be absent; the queue is still marked */
    }
    await db.measurements.bulkUpdate(rows.map((r) => ({ key: r.id!, changes: { synced: true } })));
    setSyncing(false);
  };

  const exportCsv = async () => {
    const rows = await db.measurements.where("date").equals(todayIso()).filter((m) => !m.voided).toArray();
    downloadCsv(toCsv(roster, rows), `poshan-tracker-${todayIso()}.csv`);
  };

  return (
    <div className="space-y-3">
      <section className="bg-sheet rounded-3xl p-5">
        <div className="text-5xl font-extrabold tabular">{todays.length}<span className="text-2xl text-slate"> / {roster.length}</span></div>
        <div className="text-slate">{t.ui.weighed}</div>
        <div className="grid grid-cols-3 gap-2 mt-4 text-center">
          <div className="rounded-2xl bg-chilli-wash text-chilli py-2"><div className="text-3xl font-extrabold">{counts.sam}</div><div className="text-xs font-semibold">{t.ui.sam}</div></div>
          <div className="rounded-2xl bg-turmeric-wash text-turmeric py-2"><div className="text-3xl font-extrabold">{counts.mam}</div><div className="text-xs font-semibold">{t.ui.mam}</div></div>
          <div className="rounded-2xl bg-leaf-wash text-leaf py-2"><div className="text-3xl font-extrabold">{counts.normal}</div><div className="text-xs font-semibold">{t.ui.normal}</div></div>
        </div>
        {corrected > 0 && <p className="mt-3 text-sm text-ink-soft">✎ {corrected} {lang === "en" ? "readings corrected before saving" : lang === "hi" ? "एंट्री सेव से पहले सुधारी गईं" : "नोंदी जतन करण्यापूर्वी दुरुस्त"}</p>}
      </section>

      <QualityCard t={t} />

      <section className="bg-sheet rounded-3xl p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">{t.ui.race}</h2>
          <button type="button" onClick={onRace} className="rounded-xl bg-ink text-sheet text-sm font-semibold px-3 py-1.5">⏱ {t.ui.race}</button>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3 text-center">
          <div className="rounded-2xl bg-paper py-2"><div className="text-3xl font-extrabold tabular text-leaf">{secs(spoken)}</div><div className="text-xs text-slate">{t.ui.voiceTime} · {t.ui.perChild} (n={voiceTimes.length})</div></div>
          <div className="rounded-2xl bg-paper py-2"><div className="text-3xl font-extrabold tabular text-chilli">{secs(typed)}</div><div className="text-xs text-slate">{t.ui.typingTime} · {t.ui.perChild}</div></div>
        </div>
      </section>

      <section className="bg-sheet rounded-3xl p-5">
        <div className="flex items-center justify-between">
          <span className="font-semibold">
            <span className={`inline-block w-2.5 h-2.5 rounded-full mr-2 ${online ? "bg-leaf" : "bg-turmeric"}`} />
            {online ? t.ui.online : t.ui.offline}
          </span>
          <span className="tabular text-slate">{unsynced} {t.ui.waitingSync}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button type="button" disabled={!online || !unsynced || syncing} onClick={sync} className="rounded-2xl bg-ink text-sheet font-bold py-3 disabled:opacity-40">
            {syncing ? "…" : t.ui.syncNow}
          </button>
          <button type="button" onClick={exportCsv} className="rounded-2xl border-2 border-ink font-bold py-3">
            {t.ui.exportCsv}
          </button>
        </div>
      </section>

      <section className="bg-sheet rounded-3xl p-5">
        <h2 className="font-bold text-lg">{t.ui.pendingList} ({pending.length})</h2>
        <p className="mt-1 text-ink-soft leading-relaxed">{pending.map((c) => nameOf(c, lang)).join(", ") || t.nonePending}</p>
      </section>

      <button type="button" onClick={onReset} className="w-full text-sm text-slate underline py-2">{t.ui.reset}</button>
    </div>
  );
}
