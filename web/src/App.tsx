import { useEffect, useState } from "react";
import { useWeighing } from "./hooks/useWeighing";
import { LANG_LABEL, PHRASES, type Lang } from "./lib/i18n";
import { seedIfEmpty, CENTRE } from "./lib/seed";
import { serverConfig } from "./lib/speech";
import { MicButton } from "./components/MicButton";
import { ReadingCard } from "./components/ReadingCard";
import { AlertsView, ChildrenView, SummaryView } from "./components/Views";
import { Keypad } from "./components/Keypad";
import { LogPanel } from "./components/LogPanel";
import { RaceView } from "./components/RaceView";

type Tab = "weigh" | "children" | "alerts" | "summary";

const stored = <T extends string>(key: string, fallback: T): T => {
  try {
    return (localStorage.getItem(key) as T) || fallback;
  } catch {
    return fallback;
  }
};
const store = (key: string, v: string) => {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* private mode: preference is not remembered */
  }
};

export default function App() {
  const [lang, setLang] = useState<Lang>(() => stored<Lang>("pv.lang", "mr"));
  const [engine, setEngine] = useState<"webspeech" | "sarvam">(() => stored("pv.engine", "webspeech"));
  const [tab, setTab] = useState<Tab>("weigh");
  const [online, setOnline] = useState(navigator.onLine);
  const [server, setServer] = useState({ sarvam: false, reachable: false });
  const [typed, setTyped] = useState("");
  const [race, setRace] = useState(false);
  const t = PHRASES[lang];
  const w = useWeighing(lang, engine);

  useEffect(() => {
    void seedIfEmpty();
  }, []);
  useEffect(() => {
    void serverConfig().then(setServer);
  }, []);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    addEventListener("online", on);
    addEventListener("offline", off);
    return () => {
      removeEventListener("online", on);
      removeEventListener("offline", off);
    };
  }, []);
  useEffect(() => {
    if (w.panel === "summary") setTab("summary");
  }, [w.panel]);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const pickLang = (l: Lang) => {
    setLang(l);
    store("pv.lang", l);
  };
  const pickEngine = (e: "webspeech" | "sarvam") => {
    setEngine(e);
    store("pv.engine", e);
  };

  const done = w.todays.length;
  const total = w.children.length || 1;
  const alertCount = w.todays.filter((m) => m.status !== "normal" || m.faltering).length;
  const micLabel = w.mic === "off" ? t.ui.tapToSpeak : w.mic === "listening" ? t.ui.listening : t.ui.speaking;

  const TABS: [Tab, string, number?][] = [
    ["weigh", t.ui.session],
    ["children", t.ui.children],
    ["alerts", t.ui.alerts, alertCount],
    ["summary", t.ui.summary],
  ];

  return (
    <div className="h-dvh lg:grid lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)] lg:gap-6 lg:p-6 max-w-6xl mx-auto">
      <main className="flex flex-col h-full min-h-0 max-w-[460px] w-full mx-auto">
        <header className="px-4 pt-4 pb-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h1 className="text-2xl font-extrabold leading-none">{t.ui.appName}</h1>
              <p className="text-sm text-slate">{lang === "en" ? CENTRE.name : CENTRE.nameLocal} · {CENTRE.place}</p>
            </div>
            <div className="flex items-center gap-1" role="group" aria-label={t.ui.language}>
              {(Object.keys(LANG_LABEL) as Lang[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => pickLang(l)}
                  aria-pressed={lang === l}
                  className={`px-2.5 py-1 rounded-full text-sm font-semibold ${lang === l ? "bg-ink text-sheet" : "text-ink-soft"}`}
                >
                  {LANG_LABEL[l]}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1 h-2.5 rounded-full bg-rule overflow-hidden" role="progressbar" aria-valuenow={done} aria-valuemax={total}>
              <div className="h-full bg-leaf transition-all" style={{ width: `${(done / total) * 100}%` }} />
            </div>
            <span className="text-sm tabular font-semibold">{done} {t.ui.of} {w.children.length} {t.ui.weighed}</span>
            <span className={`w-2.5 h-2.5 rounded-full ${online ? "bg-leaf" : "bg-turmeric"}`} title={online ? t.ui.online : t.ui.offline} />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0">
          {tab === "weigh" && (
            <ReadingCard draft={w.draft} phase={w.phase} saved={w.saved} lang={lang} t={t} lastSaid={w.lastSaid} onSpeak={(x) => void w.speak(x)} />
          )}
          {tab === "children" && <ChildrenView roster={w.children} lang={lang} t={t} />}
          {tab === "alerts" && <AlertsView roster={w.children} lang={lang} t={t} onSpeak={(x) => void w.speak(x)} />}
          {tab === "summary" && (
            <>
              <SummaryView
                roster={w.children}
                todays={w.todays}
                pending={w.pendingChildren}
                lang={lang}
                t={t}
                online={online}
                onReset={() => void seedIfEmpty(true).then(() => location.reload())}
                onRace={() => setRace(true)}
              />
              <section className="bg-sheet rounded-3xl p-5 mt-3 space-y-2">
                <h2 className="font-bold text-lg">{t.ui.settings}</h2>
                <label className="flex items-center justify-between gap-3">
                  <span>{t.ui.voiceEngine}</span>
                  <select value={engine} onChange={(e) => pickEngine(e.target.value as "webspeech" | "sarvam")} className="rounded-xl border-2 border-rule px-2 py-1 bg-sheet">
                    <option value="webspeech">Browser speech (free)</option>
                    <option value="sarvam" disabled={!server.sarvam}>Sarvam AI {server.sarvam ? "" : `(${t.ui.keyNotSet})`}</option>
                  </select>
                </label>
                <label className="flex items-center justify-between gap-3">
                  <span>{t.ui.handsFree}</span>
                  <input type="checkbox" checked={w.handsFree} onChange={(e) => w.setHandsFree(e.target.checked)} className="w-6 h-6 accent-ink" />
                </label>
                {!server.sarvam && (
                  <p className="text-sm text-slate">SARVAM_API_KEY: {t.ui.keyNotSet}. Browser speech and the keypad work without any key.</p>
                )}
              </section>
            </>
          )}
          {w.panel === "pending" && tab === "weigh" && (
            <section className="bg-sheet rounded-3xl p-5 mt-3">
              <h2 className="font-bold text-lg">{t.ui.pendingList} ({w.pendingChildren.length})</h2>
              <p className="mt-1 leading-relaxed">{w.pendingChildren.map((c) => (lang === "en" ? c.name : c.nameLocal)).join(", ")}</p>
            </section>
          )}
        </div>

        {tab === "weigh" && (
          <div className="px-4 pb-3 pt-2 flex flex-col items-center gap-2 bg-paper">
            <p className="min-h-7 text-center text-lg text-ink-soft leading-snug" aria-live="polite">
              {w.mic === "listening" ? (w.interim ? <>{t.ui.heard}: <b className="text-ink">{w.interim}</b></> : t.ui.listening) : w.error ? <span className="text-chilli">{w.error === "network" ? "Speech needs internet: use the keypad offline" : w.error}</span> : ""}
            </p>
            {w.lastHeard && (
              <div className="w-full grid grid-cols-[auto_1fr] gap-x-2 text-sm leading-snug bg-sheet rounded-xl px-3 py-2" aria-live="polite">
                <span className="text-slate">{t.ui.heardLabel}</span>
                <span className="font-semibold truncate">“{w.lastHeard}”</span>
                <span className="text-slate">{t.ui.understood}</span>
                <span className="truncate">
                  {w.draft.child ? (lang === "en" ? w.draft.child.name : w.draft.child.nameLocal) : w.saved && w.phase === "listen" ? (lang === "en" ? w.saved.child.name : w.saved.child.nameLocal) : "—"}
                  {(w.draft.weightKg ?? (w.phase === "listen" ? w.saved?.measurement.weightKg : undefined)) !== undefined && ` · ${w.draft.weightKg ?? w.saved?.measurement.weightKg} kg`}
                  {(w.draft.heightCm ?? (w.phase === "listen" ? w.saved?.measurement.heightCm : undefined)) !== undefined && ` · ${w.draft.heightCm ?? w.saved?.measurement.heightCm} cm`}
                  {w.phase === "plausibility" || w.phase === "force" ? <b className="text-turmeric"> · check</b> : w.phase === "confirm" ? <b className="text-leaf"> · plausible</b> : w.phase === "listen" && w.saved ? <b className="text-leaf"> · saved</b> : ""}
                </span>
              </div>
            )}
            <div className="flex items-center gap-6">
              <button type="button" onClick={() => w.setKeypadDraft(w.draft)} className="w-14 h-14 rounded-full bg-sheet shadow grid place-items-center text-xl font-bold" aria-label={t.ui.keypad}>
                123
              </button>
              <MicButton state={w.mic} label={micLabel} onClick={() => (w.mic === "off" ? void w.start() : w.stop())} />
              <button type="button" onClick={() => w.setHandsFree(!w.handsFree)} aria-pressed={w.handsFree} className={`w-14 h-14 rounded-full shadow grid place-items-center text-xs font-bold leading-tight ${w.handsFree ? "bg-ink text-sheet" : "bg-sheet"}`} title={t.ui.handsFree}>
                {w.handsFree ? "AUTO" : "1×"}
              </button>
            </div>
            <span className="text-sm text-slate">{micLabel}{!w.sttAvailable && " · Speech not supported in this browser: use Chrome, or the keypad"}</span>
            <form
              className="w-full flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (typed.trim()) void w.submitText(typed);
                setTyped("");
              }}
            >
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={lang === "en" ? "or type what you would say" : lang === "hi" ? "या जो बोलते वो लिखें" : "किंवा जे बोलाल ते लिहा"}
                className="flex-1 rounded-xl border-2 border-rule bg-sheet px-3 py-2"
                aria-label="Type an utterance"
              />
              <button type="submit" className="rounded-xl bg-ink-soft text-sheet px-4 font-semibold">↵</button>
            </form>
          </div>
        )}

        <nav className="grid grid-cols-4 border-t border-rule bg-sheet lg:rounded-b-3xl" aria-label="Sections">
          {TABS.map(([id, label, badge]) => (
            <button key={id} type="button" onClick={() => setTab(id)} aria-current={tab === id ? "page" : undefined} className={`py-3 text-sm font-semibold relative ${tab === id ? "text-ink" : "text-slate"}`}>
              {tab === id && <span className="absolute top-0 left-1/4 right-1/4 h-1 rounded-b bg-ink" />}
              {label}
              {!!badge && <span className="ml-1 inline-grid place-items-center min-w-5 h-5 px-1 rounded-full bg-chilli text-sheet text-xs">{badge}</span>}
            </button>
          ))}
        </nav>
      </main>

      <div className="hidden lg:block min-h-0">
        <LogPanel log={w.log} phase={w.phase} />
      </div>

      {race && <RaceView roster={w.children} t={t} onClose={() => setRace(false)} />}

      {w.keypadDraft && (
        <Keypad
          roster={w.children}
          draft={w.keypadDraft}
          lang={lang}
          t={t}
          onClose={() => w.setKeypadDraft(null)}
          onSave={(c, kg, cm) => void w.submitKeypad(c, kg, cm)}
        />
      )}
    </div>
  );
}
