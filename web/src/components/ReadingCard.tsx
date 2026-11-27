// The card in the middle of the weighing screen. While a reading is being
// confirmed it shows the numbers huge (readable from arm's length with a
// child on the scale). After saving it shows where the child stands.
import { useLiveQuery } from "dexie-react-hooks";
import type { Draft, Phase } from "../lib/engine";
import { historyFor, type Child } from "../lib/db";
import type { SavedResult } from "../hooks/useWeighing";
import type { Lang, Phrases } from "../lib/i18n";
import { ageInDays, ageInMonths } from "../lib/who";
import { BandRibbon } from "./BandRibbon";
import { GrowthChart } from "./GrowthChart";
import { referralText, whatsappLink } from "../lib/export";
import { familyMessage } from "../lib/counsel";
import { FamilyMessage } from "./Views";

const STATUS_STYLE = {
  normal: "bg-leaf-wash text-leaf",
  mam: "bg-turmeric-wash text-turmeric",
  sam: "bg-chilli-wash text-chilli",
} as const;

function childLine(c: Child, lang: Lang, t: Phrases) {
  const months = ageInMonths(ageInDays(c.dob));
  const sex = lang === "en" ? (c.sex === "M" ? "boy" : "girl") : c.sex === "M" ? "♂" : "♀";
  return `${months} ${t.ui.months} · ${sex} · ${c.parentName}`;
}

function Value({ value, unit, flagged, previous }: { value?: number; unit: string; flagged?: boolean; previous?: number }) {
  return (
    <div className={`rounded-2xl px-4 py-3 ${flagged ? "bg-turmeric-wash ring-2 ring-turmeric" : "bg-paper"}`}>
      <div className="flex items-baseline gap-1">
        <span className="text-6xl font-extrabold tabular leading-none">{value ?? "—"}</span>
        <span className="text-lg text-slate">{unit}</span>
      </div>
      {previous !== undefined && <div className="text-sm text-slate tabular mt-1">← {previous} {unit}</div>}
    </div>
  );
}

export function ReadingCard({
  draft, phase, saved, lang, t, lastSaid, onSpeak,
}: {
  draft: Draft;
  phase: Phase;
  saved: SavedResult | null;
  lang: Lang;
  t: Phrases;
  lastSaid: string;
  onSpeak: (text: string) => void;
}) {
  const inProgress = !!draft.child || draft.weightKg !== undefined || draft.heightCm !== undefined || phase === "disambiguate";
  const savedChildId = saved?.child.id;
  const history = useLiveQuery(() => (savedChildId ? historyFor(savedChildId) : Promise.resolve([])), [savedChildId, saved?.measurement.id], []);

  if (inProgress) {
    const c = draft.child;
    const issue = draft.issue;
    return (
      <section className="bg-sheet rounded-3xl p-5 shadow-sm" aria-live="polite">
        {phase === "disambiguate" && draft.options ? (
          <div>
            <p className="text-2xl font-bold">{t.ui.whichOne}</p>
            <ul className="mt-2 space-y-2">
              {draft.options.map((o) => (
                <li key={o.id} className="rounded-xl bg-paper px-4 py-3">
                  <div className="text-2xl font-bold">{lang === "en" ? o.name : o.nameLocal}</div>
                  <div className="text-sm text-slate">{childLine(o, lang, t)}</div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            <div className="text-3xl font-bold leading-tight">{c ? (lang === "en" ? c.name : c.nameLocal) : "?"}</div>
            {c && <div className="text-sm text-slate">{childLine(c, lang, t)}</div>}
            <div className="grid grid-cols-2 gap-3 mt-4">
              <Value value={draft.weightKg} unit={t.ui.kg} flagged={issue?.field === "weightKg"} previous={issue?.field === "weightKg" ? issue.previous : undefined} />
              <Value value={draft.heightCm} unit={t.ui.cm} flagged={issue?.field === "heightCm"} previous={issue?.field === "heightCm" ? issue.previous : undefined} />
            </div>
            {issue?.suggestion !== undefined && (
              <p className="mt-3 text-lg font-semibold text-turmeric">
                {t.ui.suggestion} {issue.suggestion} {issue.field === "weightKg" ? t.ui.kg : t.ui.cm}?
              </p>
            )}
          </>
        )}
        {lastSaid && <p className="mt-4 text-lg leading-snug text-ink-soft">“{lastSaid}”</p>}
      </section>
    );
  }

  if (saved) {
    const { measurement: m, child: c, previous } = saved;
    const slip = m.status !== "normal" ? referralText(c, m, previous) : "";
    return (
      <section className="bg-sheet rounded-3xl p-5 shadow-sm drop-in" aria-live="polite">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-3xl font-bold leading-tight">{lang === "en" ? c.name : c.nameLocal}</div>
            <div className="text-sm text-slate">{childLine(c, lang, t)}</div>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${STATUS_STYLE[m.status]}`}>{t.ui[m.status]}</span>
        </div>
        <div className="mt-3 flex gap-6 tabular">
          <div><span className="text-4xl font-extrabold">{m.weightKg}</span> <span className="text-slate">{t.ui.kg}</span></div>
          <div><span className="text-4xl font-extrabold">{m.heightCm}</span> <span className="text-slate">{t.ui.cm}</span></div>
        </div>
        {previous && (
          <div className={`text-sm tabular ${m.weightKg < previous.weightKg ? "text-chilli font-semibold" : "text-slate"}`}>
            {t.ui.lastMonth}: {previous.weightKg} {t.ui.kg} · {previous.heightCm} {t.ui.cm}
          </div>
        )}
        <BandRibbon z={m.whz} label="WHZ" />
        <GrowthChart child={c} history={history} />
        {slip && (
          <a
            href={whatsappLink(slip)}
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex items-center justify-center gap-2 rounded-2xl bg-leaf text-sheet font-bold text-lg py-3"
          >
            {t.ui.referral}: {t.ui.share}
          </a>
        )}
        <FamilyMessage text={familyMessage(c, m, previous, lang)} t={t} onSpeak={onSpeak} />
      </section>
    );
  }

  return (
    <section className="bg-sheet rounded-3xl p-6 shadow-sm">
      <p className="text-2xl font-bold leading-snug">{t.ready}</p>
      <p className="mt-3 text-lg text-ink-soft">
        {lang === "en" ? "“Riya Pawar, nine point two kilo, seventy four centimetre”" : lang === "hi" ? "“रिया पवार, नौ पॉइंट दो किलो, चौहत्तर सेंटीमीटर”" : "“रिया पवार, नऊ पॉइंट दोन किलो, चौऱ्याहत्तर सेंटीमीटर”"}
      </p>
    </section>
  );
}
