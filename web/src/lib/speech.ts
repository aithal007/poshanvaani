// Speech in and out, behind small provider interfaces so the engine can
// be swapped without touching the app:
//
//   STT  webspeech  Browser Web Speech API (Chrome). Free, no key.
//        sarvam     Sarvam AI Saaras via our server proxy. Needs SARVAM_API_KEY
//                   on the server; the key never reaches the browser.
//   TTS  browser    speechSynthesis with mr-IN -> hi-IN -> en-IN fallback.
//        sarvam     Sarvam Bulbul via the proxy.
//
// If every speech engine fails, the app still works with the keypad.

export interface Heard {
  text: string;
  alternatives: string[];
  confidence?: number;
  audio?: Blob;
}

export interface SttProvider {
  id: "webspeech" | "sarvam";
  available(): boolean;
  listen(lang: string, onInterim: (text: string) => void, hints?: string[]): Promise<Heard>;
  stop(): void;
}

type SR = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

const SRClass = (): (new () => SR) | undefined =>
  (globalThis as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR })
    .SpeechRecognition ??
  (globalThis as unknown as { webkitSpeechRecognition?: new () => SR }).webkitSpeechRecognition;

/** Record a short clip of the spoken reading alongside recognition. */
class ClipRecorder {
  private rec?: MediaRecorder;
  private chunks: Blob[] = [];
  private stream?: MediaStream;

  async start() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.rec = new MediaRecorder(this.stream);
      this.chunks = [];
      this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
      this.rec.start();
    } catch {
      this.rec = undefined;
    }
  }

  stop(): Promise<Blob | undefined> {
    return new Promise((resolve) => {
      const rec = this.rec;
      if (!rec || rec.state === "inactive") {
        this.release();
        return resolve(undefined);
      }
      rec.onstop = () => {
        this.release();
        resolve(this.chunks.length ? new Blob(this.chunks, { type: rec.mimeType }) : undefined);
      };
      rec.stop();
    });
  }

  private release() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = undefined;
  }
}

export class WebSpeechStt implements SttProvider {
  id = "webspeech" as const;
  private rec?: SR;
  recordClips = true;

  available() {
    return !!SRClass();
  }

  listen(lang: string, onInterim: (t: string) => void): Promise<Heard> {
    const Ctor = SRClass();
    if (!Ctor) return Promise.reject(new Error("unsupported"));
    const rec = new Ctor();
    this.rec = rec;
    rec.lang = lang;
    rec.continuous = false; // one sentence per turn: reliable on Android too
    rec.interimResults = true;
    rec.maxAlternatives = 4;
    const clip = new ClipRecorder();
    if (this.recordClips) void clip.start();

    return new Promise((resolve, reject) => {
      let final: Heard | null = null;
      let interim = "";
      rec.onresult = (e) => {
        interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) {
            const alts = Array.from({ length: r.length }, (_, k) => r[k].transcript.trim());
            final = { text: alts[0], alternatives: alts.slice(1), confidence: r[0].confidence };
          } else interim += r[0].transcript;
        }
        onInterim(final?.text ?? interim);
      };
      rec.onerror = (e) => {
        if (e.error === "no-speech" || e.error === "aborted") return; // onend resolves empty
        void clip.stop();
        reject(new Error(e.error));
      };
      rec.onend = async () => {
        const audio = await clip.stop();
        resolve(final ? { ...final, audio } : { text: interim.trim(), alternatives: [], audio });
      };
      try {
        rec.start();
      } catch (err) {
        reject(err as Error);
      }
    });
  }

  stop() {
    this.rec?.stop();
  }
}

/** Records until the speaker pauses, then transcribes on the server. */
export class SarvamStt implements SttProvider {
  id = "sarvam" as const;
  private stopNow?: () => void;

  available() {
    return typeof MediaRecorder !== "undefined";
  }

  async listen(lang: string, onInterim: (t: string) => void, hints: string[] = []): Promise<Heard> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);

    // Simple voice-activity detection: stop after 1.2 s of silence once
    // speech has started, or after 10 s.
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    let spoke = false;
    let quietSince = performance.now();
    const started = performance.now();

    const done = new Promise<void>((resolve) => {
      this.stopNow = resolve;
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += (v - 128) ** 2;
        const rms = Math.sqrt(sum / buf.length);
        const now = performance.now();
        if (rms > 6) {
          spoke = true;
          quietSince = now;
        }
        if ((spoke && now - quietSince > 1200) || now - started > 10000) return resolve();
        requestAnimationFrame(tick);
      };
      tick();
    });

    rec.start();
    onInterim("…");
    await done;
    await new Promise<void>((r) => {
      rec.onstop = () => r();
      rec.stop();
    });
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close();

    const audio = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
    const form = new FormData();
    form.append("file", audio, "speech.webm");
    form.append("language_code", lang);
    form.append("keyterms", JSON.stringify(hints.slice(0, 50)));
    const res = await fetch("/api/stt", { method: "POST", body: form });
    if (!res.ok) throw new Error(`stt ${res.status}`);
    const json = (await res.json()) as { transcript: string };
    onInterim(json.transcript);
    return { text: json.transcript, alternatives: [], audio };
  }

  stop() {
    this.stopNow?.();
  }
}

// ---------- text to speech ----------

/** `?mute` in the URL silences speech output (automated tests, quiet demos). */
const MUTED = typeof location !== "undefined" && new URLSearchParams(location.search).has("mute");

export interface TtsProvider {
  id: "browser" | "sarvam";
  speak(text: string, lang: string): Promise<void>;
  cancel(): void;
}

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const voices = speechSynthesis.getVoices();
  const norm = (l: string) => l.replace("_", "-").toLowerCase();
  const chain = lang === "mr-IN" ? ["mr-in", "hi-in", "en-in"] : lang === "hi-IN" ? ["hi-in", "en-in"] : ["en-in", "en-gb", "en-us"];
  for (const l of chain) {
    const matches = voices.filter((v) => norm(v.lang) === l);
    const v = matches.find((x) => /google|natural|online/i.test(x.name)) ?? matches[0];
    if (v) return v;
  }
  return undefined;
}

export function voiceFor(lang: string): string {
  if (typeof speechSynthesis === "undefined") return "none";
  const v = pickVoice(lang);
  return v ? `${v.name} (${v.lang})` : "default";
}

export class BrowserTts implements TtsProvider {
  id = "browser" as const;

  speak(text: string, lang: string): Promise<void> {
    if (!text || typeof speechSynthesis === "undefined" || MUTED) return Promise.resolve();
    speechSynthesis.cancel();
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      const voice = pickVoice(lang);
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang;
      } else u.lang = lang;
      u.rate = 0.95;
      // Chrome sometimes never fires onend; never block the conversation.
      const guard = setTimeout(resolve, 1500 + text.length * 110);
      u.onend = u.onerror = () => {
        clearTimeout(guard);
        resolve();
      };
      speechSynthesis.speak(u);
    });
  }

  cancel() {
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  }
}

export class SarvamTts implements TtsProvider {
  id = "sarvam" as const;
  private audio?: HTMLAudioElement;
  private fallback = new BrowserTts();

  async speak(text: string, lang: string): Promise<void> {
    if (!text) return;
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, language_code: lang }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const { audio } = (await res.json()) as { audio: string };
      this.audio = new Audio(`data:audio/wav;base64,${audio}`);
      await new Promise<void>((resolve) => {
        this.audio!.onended = () => resolve();
        this.audio!.onerror = () => resolve();
        void this.audio!.play().catch(() => resolve());
      });
    } catch {
      await this.fallback.speak(text, lang);
    }
  }

  cancel() {
    this.audio?.pause();
    this.fallback.cancel();
  }
}

/** Which optional server-side engines are configured. */
export async function serverConfig(): Promise<{ sarvam: boolean; reachable: boolean }> {
  try {
    const res = await fetch("/api/config", { cache: "no-store" });
    if (!res.ok) return { sarvam: false, reachable: false };
    const j = (await res.json()) as { sarvam?: boolean };
    return { sarvam: !!j.sarvam, reachable: true };
  } catch {
    return { sarvam: false, reachable: false };
  }
}

// ---------- earcons ----------

let audioCtx: AudioContext | undefined;

/** Short non-verbal cues: "ok" (rising) when saved, "warn" (falling) when a value needs checking. */
export function earcon(kind: "ok" | "warn"): Promise<void> {
  if (MUTED || typeof AudioContext === "undefined") return Promise.resolve();
  audioCtx ??= new AudioContext();
  const ctx = audioCtx;
  const notes = kind === "ok" ? [660, 990] : [520, 390];
  notes.forEach((f, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const t = ctx.currentTime + i * 0.13;
    o.frequency.value = f;
    o.type = "sine";
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.13);
  });
  return new Promise((r) => setTimeout(r, 300));
}
