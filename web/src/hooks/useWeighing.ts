// Wires the conversation engine to speech, storage and alerts.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, lastMeasurement, todayIso, type Child, type Measurement } from "../lib/db";
import { Engine, type Draft, type Phase, type Turn } from "../lib/engine";
import { PHRASES, SPEECH_LANG, type Lang } from "../lib/i18n";
import { BrowserTts, SarvamStt, SarvamTts, WebSpeechStt, earcon, type SttProvider, type TtsProvider } from "../lib/speech";
import { ageInDays, ageInMonths, classify, zScores } from "../lib/who";
import { isFaltering, type PreviousReading } from "../lib/plausibility";

export type MicState = "off" | "listening" | "thinking" | "speaking";

export interface LogEntry {
  at: number;
  who: "worker" | "app" | "system";
  text: string;
  detail?: string;
}

export interface SavedResult {
  measurement: Measurement;
  child: Child;
  previous?: Measurement;
}

export function useWeighing(lang: Lang, engineChoice: "webspeech" | "sarvam") {
  const children = useLiveQuery(() => db.children.toArray(), [], [] as Child[]);
  const today = todayIso();
  const todays = useLiveQuery(
    () => db.measurements.where("date").equals(today).filter((m) => !m.voided).toArray(),
    [today],
    [] as Measurement[]
  );

  const [mic, setMic] = useState<MicState>("off");
  const [handsFree, setHandsFree] = useState(true);
  const [phase, setPhase] = useState<Phase>("listen");
  const [draft, setDraft] = useState<Draft>({ transcripts: [], corrected: false, forced: false });
  const [interim, setInterim] = useState("");
  const [lastSaid, setLastSaid] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [saved, setSaved] = useState<SavedResult | null>(null);
  const [keypadDraft, setKeypadDraft] = useState<Draft | null>(null);
  const [panel, setPanel] = useState<"pending" | "summary" | null>(null);
  const [error, setError] = useState("");

  const prevCache = useRef(new Map<string, PreviousReading>());
  const active = useRef(false);
  const handsFreeRef = useRef(handsFree);
  handsFreeRef.current = handsFree;
  const lastAudio = useRef<Blob | undefined>(undefined);
  const lastEngineId = useRef<string>("webspeech");
  const entryStart = useRef<number | null>(null);
  const [lastHeard, setLastHeard] = useState("");

  const stt: SttProvider = useMemo(
    () => (engineChoice === "sarvam" ? new SarvamStt() : new WebSpeechStt()),
    [engineChoice]
  );
  const tts: TtsProvider = useMemo(() => (engineChoice === "sarvam" ? new SarvamTts() : new BrowserTts()), [engineChoice]);
  const phrases = PHRASES[lang];

  // Cache last month's readings so the engine can check synchronously.
  useEffect(() => {
    void (async () => {
      const map = new Map<string, PreviousReading>();
      for (const c of children) {
        const m = await lastMeasurement(c.id, today);
        if (m) map.set(c.id, { weightKg: m.weightKg, heightCm: m.heightCm, date: m.date });
      }
      prevCache.current = map;
    })();
  }, [children, today]);

  const engine = useMemo(
    () =>
      new Engine({
        roster: [],
        previous: (id) => prevCache.current.get(id),
        ageMonths: (c) => ageInMonths(ageInDays(c.dob)),
        phrases,
        lang,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  engine.deps.roster = children;
  engine.deps.phrases = phrases;
  engine.deps.lang = lang;

  const addLog = useCallback((who: LogEntry["who"], text: string, detail?: string) => {
    setLog((l) => [...l.slice(-60), { at: Date.now(), who, text, detail }]);
  }, []);

  const say = useCallback(
    async (text: string) => {
      if (!text) return;
      setLastSaid(text);
      addLog("app", text);
      setMic("speaking");
      await tts.speak(text, SPEECH_LANG[lang]);
    },
    [tts, lang, addLog]
  );

  /** Persist a confirmed reading and work out alerts. */
  const saveReading = useCallback(
    async (d: Draft & { child: Child; weightKg: number; heightCm: number }, engineId: string) => {
      const child = d.child;
      const days = ageInDays(child.dob);
      const z = zScores(child.sex, days, d.weightKg, d.heightCm);
      const c = classify(z, d.muacCm, days, d.oedema);
      const prev = await lastMeasurement(child.id, today);
      const prevReading = prev ? { weightKg: prev.weightKg, heightCm: prev.heightCm, date: prev.date } : undefined;
      const m: Measurement = {
        childId: child.id,
        date: today,
        takenAt: Date.now(),
        weightKg: d.weightKg,
        heightCm: d.heightCm,
        muacCm: d.muacCm,
        oedema: d.oedema,
        waz: z.waz,
        haz: z.haz,
        whz: z.whz,
        status: c.status,
        faltering: isFaltering(d.weightKg, prevReading),
        transcript: d.transcripts.join(" | "),
        corrected: d.corrected,
        forced: d.forced,
        engine: engineId,
        audio: lastAudio.current,
        durationMs: entryStart.current ? Date.now() - entryStart.current : undefined,
        synced: false,
        voided: false,
      };
      // One reading per child per day: a new one replaces (voids) the old.
      const sameDay = await db.measurements.where({ childId: child.id, date: today }).toArray();
      await db.transaction("rw", db.measurements, db.referrals, async () => {
        for (const s of sameDay) if (!s.voided) await db.measurements.update(s.id!, { voided: true });
        const id = await db.measurements.add(m);
        m.id = id as number;
        if (c.status !== "normal") {
          await db.referrals.add({
            childId: child.id,
            measurementId: m.id,
            createdAt: Date.now(),
            status: c.status,
            reason: `WHZ ${z.whz ?? "–"}${d.muacCm ? `, MUAC ${d.muacCm} cm` : ""}${d.oedema ? ", bilateral oedema" : ""}`,
            shared: false,
          });
        }
      });
      addLog("system", `Saved ${child.name}: ${d.weightKg} kg, ${d.heightCm} cm`, `WAZ ${z.waz} · HAZ ${z.haz} · WHZ ${z.whz} → ${c.status.toUpperCase()}`);
      setSaved({ measurement: m, child, previous: prev });

      const name = lang === "en" ? child.name : child.nameLocal;
      const lostG = prev && d.weightKg < prev.weightKg ? Math.round((prev.weightKg - d.weightKg) * 1000) : null;
      if (c.status === "sam") return phrases.sam(name, lostG);
      if (c.status === "mam") return phrases.mam(name);
      if (m.faltering) return phrases.faltering(name);
      return "";
    },
    [today, lang, phrases, addLog]
  );

  const pendingChildren = useMemo(() => {
    const done = new Set(todays.map((m) => m.childId));
    return children.filter((c) => !done.has(c.id));
  }, [children, todays]);

  /** Carry out the engine's reply for one turn. */
  const applyTurn = useCallback(
    async (turn: Turn): Promise<boolean> => {
      setPhase(turn.phase);
      setDraft(turn.draft);
      if (turn.phase === "plausibility" || turn.phase === "force") await earcon("warn");
      let speech = turn.say;
      let keepGoing = true;
      switch (turn.effect?.type) {
        case "save": {
          const alert = await saveReading(turn.effect.draft, lastEngineId.current);
          entryStart.current = null;
          await earcon("ok");
          speech = [turn.say, alert, phrases.next].filter(Boolean).join(" ");
          break;
        }
        case "pending": {
          entryStart.current = null;
          const names = pendingChildren.map((c) => (lang === "en" ? c.name.split(" ")[0] : c.nameLocal.split(" ")[0]));
          speech = names.length ? phrases.pending(names) : phrases.nonePending;
          setPanel("pending");
          break;
        }
        case "undo": {
          const last = await db.measurements.where("date").equals(today).filter((m) => !m.voided).sortBy("takenAt");
          const m = last[last.length - 1];
          if (m) {
            await db.measurements.update(m.id!, { voided: true });
            const c = children.find((x) => x.id === m.childId);
            speech = phrases.undone(c ? (lang === "en" ? c.name : c.nameLocal) : "");
            setSaved(null);
          }
          break;
        }
        case "end": {
          const alerts = todays.filter((m) => m.status !== "normal").length;
          speech = phrases.sessionEnd(todays.length, alerts);
          setPanel("summary");
          keepGoing = false;
          break;
        }
        case "keypad":
          setKeypadDraft(turn.effect.draft);
          keepGoing = false;
          break;
      }
      await say(speech);
      return keepGoing;
    },
    [saveReading, phrases, pendingChildren, lang, today, children, todays, say]
  );

  /** One listen → think → reply cycle; repeats while hands-free is on. */
  const listenOnce = useCallback(async () => {
    setError("");
    setInterim("");
    setMic("listening");
    if (engine.phase === "listen" && entryStart.current === null) entryStart.current = Date.now();
    let heard;
    try {
      heard = await stt.listen(SPEECH_LANG[lang], setInterim, children.map((c) => c.name));
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      addLog("system", `Speech engine error: ${msg}`);
      setMic("off");
      active.current = false;
      if (msg === "not-allowed" || msg === "service-not-allowed") setKeypadDraft(engine.draft);
      return false;
    }
    lastAudio.current = heard.audio;
    lastEngineId.current = stt.id;
    setMic("thinking");
    if (heard.text) setLastHeard(heard.text);
    else if (engine.phase === "listen") entryStart.current = null;
    if (heard.text) addLog("worker", heard.text, heard.alternatives.length ? `alt: ${heard.alternatives.join(" / ")}` : undefined);
    const turn = engine.handle(heard.text, heard.alternatives);
    return applyTurn(turn);
  }, [stt, lang, children, engine, applyTurn, addLog]);

  const loop = useCallback(async () => {
    while (active.current) {
      const keepGoing = await listenOnce();
      if (!keepGoing || !handsFreeRef.current) break;
    }
    active.current = false;
    setMic("off");
  }, [listenOnce]);

  const start = useCallback(async () => {
    if (active.current) return;
    active.current = true;
    setPanel(null);
    if (engine.phase === "listen" && !engine.draft.child && log.length === 0) await say(phrases.ready);
    await loop();
  }, [engine, log.length, say, phrases.ready, loop]);

  const stop = useCallback(() => {
    active.current = false;
    stt.stop();
    tts.cancel();
    setMic("off");
  }, [stt, tts]);

  /** Typed input path: same engine, same checks (keypad and demo mode). */
  const submitText = useCallback(
    async (text: string) => {
      addLog("worker", text, "typed");
      setLastHeard(text);
      if (engine.phase === "listen" && entryStart.current === null) entryStart.current = Date.now();
      lastAudio.current = undefined;
      lastEngineId.current = "manual";
      const turn = engine.handle(text);
      await applyTurn(turn);
      setMic("off");
    },
    [engine, applyTurn, addLog]
  );

  /** Keypad save: bypasses speech but still runs plausibility + read-back. */
  const submitKeypad = useCallback(
    async (child: Child, weightKg: number, heightCm: number) => {
      setKeypadDraft(null);
      engine.reset();
      const text = `${child.name} ${weightKg} kg ${heightCm} cm`;
      await submitText(text);
    },
    [engine, submitText]
  );

  const resetConversation = useCallback(() => {
    engine.reset();
    setPhase("listen");
    setDraft({ transcripts: [], corrected: false, forced: false });
  }, [engine]);

  return {
    children, todays, pendingChildren, mic, phase, draft, interim, lastSaid, lastHeard, log, saved, error,
    handsFree, setHandsFree, start, stop, submitText, submitKeypad, keypadDraft, setKeypadDraft,
    panel, setPanel, resetConversation, sttAvailable: stt.available(), sttId: stt.id, speak: say,
  };
}
