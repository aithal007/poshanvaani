// The conversation engine: one spoken sentence in, one spoken reply out.
//
// It is pure logic (no audio, no storage) so every turn of the voice flow
// is unit-tested. The React layer feeds it transcripts and carries out
// the effects it returns (speak, save, show keypad, export...).
//
//   listen ──name+numbers──▶ [disambiguate] ─▶ [ask missing field]
//      ▲                                          │
//      │                              plausibility check
//      │                         ┌───── issue ────┴──── ok ─────┐
//      │                    plausibility ── yes/number ──▶  confirm (read-back)
//      └──────────── "ho" saves ◀───────────────────────────────┘
import { pickFromOptions, resolveName } from "./names";
import { assignFields, parseUtterance, quantities, tokenize, type Measurement } from "./parse";
import { checkReading, type Field, type Issue, type PreviousReading } from "./plausibility";
import type { Phrases, Lang } from "./i18n";
import type { Child } from "./db";

export type Phase = "listen" | "needName" | "needField" | "disambiguate" | "plausibility" | "force" | "confirm";

export interface Draft {
  child?: Child;
  weightKg?: number;
  heightCm?: number;
  muacCm?: number;
  transcripts: string[];
  corrected: boolean;
  forced: boolean;
  issue?: Issue;
  options?: Child[];
  missing?: "weight" | "height";
}

export type Effect =
  | { type: "save"; draft: Required<Pick<Draft, "child" | "weightKg" | "heightCm">> & Draft }
  | { type: "pending" }
  | { type: "undo" }
  | { type: "end" }
  | { type: "keypad"; draft: Draft };

export interface Turn {
  say: string;
  phase: Phase;
  draft: Draft;
  effect?: Effect;
}

export interface EngineDeps {
  roster: Child[];
  previous: (childId: string) => PreviousReading | undefined;
  ageMonths: (child: Child) => number;
  phrases: Phrases;
  lang: Lang;
  today?: Date;
}

const emptyDraft = (): Draft => ({ transcripts: [], corrected: false, forced: false });
const MAX_RETRIES = 2;

export class Engine {
  phase: Phase = "listen";
  draft: Draft = emptyDraft();
  private retries = 0;
  deps: EngineDeps;

  constructor(deps: EngineDeps) {
    this.deps = deps;
  }

  reset(): void {
    this.phase = "listen";
    this.draft = emptyDraft();
    this.retries = 0;
  }

  displayName(c: Child): string {
    return this.deps.lang === "en" ? c.name : c.nameLocal;
  }

  private turn(say: string, effect?: Effect): Turn {
    return { say, phase: this.phase, draft: { ...this.draft }, effect };
  }

  /** Feed one transcript (and optional alternative transcripts). */
  handle(text: string, alternatives: string[] = []): Turn {
    const t = this.deps.phrases;
    const transcript = text.trim();
    if (!transcript) return this.miss();

    const parsed = parseUtterance(transcript);
    // Global voice commands work in any phase.
    if (parsed.intent === "pending") return this.turn("", { type: "pending" });
    if (parsed.intent === "undo") {
      this.reset();
      return this.turn("", { type: "undo" });
    }
    if (parsed.intent === "stop") {
      this.reset();
      return this.turn("", { type: "end" });
    }
    if (parsed.intent === "start" && this.phase === "listen") return this.turn(t.ready);

    this.draft.transcripts.push(transcript);

    switch (this.phase) {
      case "listen":
      case "needName":
        return this.onNewReading(transcript, alternatives);
      case "disambiguate":
        return this.onDisambiguate(transcript);
      case "needField":
        return this.onField(transcript);
      case "plausibility":
        return this.onPlausibility(transcript, parsed.intent);
      case "force":
        if (parsed.intent === "yes") {
          this.draft.forced = true;
          this.draft.issue = undefined;
          return this.confirm();
        }
        return this.onPlausibility(transcript, parsed.intent);
      case "confirm":
        return this.onConfirm(transcript, parsed.intent);
    }
  }

  /** Nothing usable was heard. After two misses, offer the keypad. */
  miss(): Turn {
    this.retries++;
    if (this.retries > MAX_RETRIES) {
      this.retries = 0;
      return this.turn(this.deps.phrases.tapFallback, { type: "keypad", draft: { ...this.draft } });
    }
    return this.turn(this.deps.phrases.notHeard);
  }

  private onNewReading(text: string, alternatives: string[]): Turn {
    const t = this.deps.phrases;
    const keepNumbers = this.phase === "needName" ? { ...this.draft } : undefined;
    // Try the best transcript first, then the recogniser's alternatives:
    // pick the first one that names a child on the roster.
    let chosen = parseUtterance(text);
    let result = resolveName(chosen.nameText || text, this.deps.roster);
    for (const alt of alternatives) {
      if (result.kind === "match") break;
      const p = parseUtterance(alt);
      const r = resolveName(p.nameText || alt, this.deps.roster);
      if (r.kind === "match" || (r.kind === "ambiguous" && result.kind === "none")) {
        chosen = p;
        result = r;
      }
    }

    const m = chosen.measurement;
    this.draft = {
      ...emptyDraft(),
      transcripts: this.draft.transcripts,
      weightKg: m.weightKg ?? keepNumbers?.weightKg,
      heightCm: m.heightCm ?? keepNumbers?.heightCm,
      muacCm: m.muacCm ?? keepNumbers?.muacCm,
    };

    if (result.kind === "none") {
      const hasNumbers = m.weightKg !== undefined || m.heightCm !== undefined;
      if (hasNumbers && !chosen.nameText) {
        this.phase = "needName";
        return this.turn(t.askField("name"));
      }
      if (!chosen.nameText) return this.miss();
      this.phase = "needName";
      return this.turn(t.notOnList(chosen.nameText));
    }
    if (result.kind === "ambiguous") {
      this.phase = "disambiguate";
      this.draft.options = result.options;
      const label = (c: Child) => `${this.displayName(c)}`;
      return this.turn(t.whichChild(label(result.options[0]), label(result.options[1])));
    }
    this.draft.child = result.child;
    this.retries = 0;
    return this.afterChild();
  }

  private onDisambiguate(text: string): Turn {
    const picked = pickFromOptions(text, this.draft.options ?? []);
    if (!picked) {
      // Maybe the answer contains the full name again.
      const r = resolveName(parseUtterance(text).nameText || text, this.draft.options ?? []);
      if (r.kind !== "match") {
        const [a, b] = this.draft.options ?? [];
        this.retries++;
        if (this.retries > MAX_RETRIES) return this.turn(this.deps.phrases.tapFallback, { type: "keypad", draft: { ...this.draft } });
        return this.turn(this.deps.phrases.whichChild(this.displayName(a), this.displayName(b)));
      }
      this.draft.child = r.child;
    } else {
      this.draft.child = picked;
    }
    this.draft.options = undefined;
    this.retries = 0;
    // The answer may also carry the numbers ("Pawar, 6.6 kilo").
    this.mergeNumbers(text);
    return this.afterChild();
  }

  private onField(text: string): Turn {
    const before = { w: this.draft.weightKg, h: this.draft.heightCm };
    const missing = this.draft.missing;
    const { qty } = quantities(tokenize(text));
    if (qty.length === 1 && qty[0].unit === undefined && qty[0].field === undefined && missing) {
      // A bare number answers the question we asked.
      if (missing === "weight") this.draft.weightKg = qty[0].value;
      else this.draft.heightCm = qty[0].value;
    } else {
      this.mergeNumbers(text);
    }
    if (before.w === this.draft.weightKg && before.h === this.draft.heightCm) return this.miss();
    this.retries = 0;
    return this.afterChild();
  }

  private onPlausibility(text: string, intent: string): Turn {
    const issue = this.draft.issue!;
    const spoken = this.numbersIn(text);
    if (spoken.length) {
      // "nahi, 82" or just "82": the worker re-measured and gives the value.
      this.setField(issue.field, this.pickForField(issue.field, spoken));
      this.draft.corrected = true;
      return this.afterChild();
    }
    if (intent === "yes") {
      if (issue.suggestion !== undefined) {
        this.setField(issue.field, issue.suggestion);
        this.draft.corrected = true;
        return this.afterChild();
      }
      this.phase = "force";
      return this.turn(this.deps.phrases.forceSaveWarn);
    }
    if (intent === "no") {
      // Keep the spoken value? Ask for a fresh measurement.
      this.phase = "needField";
      this.draft.missing = issue.field === "weightKg" ? "weight" : "height";
      this.setField(issue.field, undefined);
      return this.turn(this.deps.phrases.askField(this.draft.missing));
    }
    return this.turn(this.plausibilityQuestion(issue));
  }

  private onConfirm(text: string, intent: string): Turn {
    const t = this.deps.phrases;
    if (intent === "yes") {
      const d = this.draft;
      const effect: Effect = {
        type: "save",
        draft: { ...d, child: d.child!, weightKg: d.weightKg!, heightCm: d.heightCm! },
      };
      this.reset();
      return this.turn(t.saved, effect);
    }
    const spoken = this.numbersIn(text);
    if (intent === "no" && !spoken.length) {
      this.reset();
      return this.turn(t.discarded);
    }
    if (spoken.length) {
      // "nahi, 9.4 kilo": correct only that field.
      const before = { w: this.draft.weightKg, h: this.draft.heightCm };
      this.mergeNumbers(text, true);
      if (before.w !== this.draft.weightKg || before.h !== this.draft.heightCm) this.draft.corrected = true;
      // A completely new child + reading means she moved on.
      const r = resolveName(parseUtterance(text).nameText, this.deps.roster);
      if (r.kind === "match" && r.child.id !== this.draft.child?.id) {
        this.phase = "listen";
        return this.onNewReading(text, []);
      }
      return this.afterChild();
    }
    return this.turn(this.readback());
  }

  /** After the child is known: ask for missing values, check, read back. */
  private afterChild(): Turn {
    const t = this.deps.phrases;
    const d = this.draft;
    if (d.weightKg === undefined || d.heightCm === undefined) {
      this.phase = "needField";
      d.missing = d.weightKg === undefined ? "weight" : "height";
      return this.turn(`${this.displayName(d.child!)}. ${t.askField(d.missing)}`);
    }
    d.missing = undefined;
    if (!d.forced) {
      const issues = checkReading(
        { weightKg: d.weightKg, heightCm: d.heightCm },
        this.deps.previous(d.child!.id),
        this.deps.ageMonths(d.child!),
        this.deps.today
      );
      if (issues.length) {
        d.issue = issues[0];
        this.phase = "plausibility";
        return this.turn(this.plausibilityQuestion(issues[0]));
      }
    }
    d.issue = undefined;
    return this.confirm();
  }

  private confirm(): Turn {
    this.phase = "confirm";
    return this.turn(this.readback());
  }

  private readback(): string {
    const d = this.draft;
    const prev = this.deps.previous(d.child!.id);
    const delta = prev && d.weightKg !== undefined ? Math.round((d.weightKg - prev.weightKg) * 1000) : null;
    return this.deps.phrases.readback(this.displayName(d.child!), d.weightKg, d.heightCm, delta);
  }

  private plausibilityQuestion(issue: Issue): string {
    return this.deps.phrases.didYouMean(
      issue.field === "weightKg" ? "weight" : "height",
      issue.value,
      issue.previous,
      issue.suggestion
    );
  }

  private numbersIn(text: string) {
    return quantities(tokenize(text)).qty;
  }

  private pickForField(field: Field, qty: ReturnType<typeof quantities>["qty"]): number {
    const m = assignFields(qty);
    const v = field === "weightKg" ? m.weightKg : m.heightCm;
    return v ?? qty[0].value;
  }

  private setField(field: Field, value: number | undefined) {
    if (field === "weightKg") this.draft.weightKg = value;
    else this.draft.heightCm = value;
  }

  /** Merge numbers from a follow-up sentence into the draft. */
  private mergeNumbers(text: string, overwrite = false) {
    const { qty } = quantities(tokenize(text));
    if (!qty.length) return;
    let m: Measurement = assignFields(qty);
    if (overwrite && qty.length === 1 && !qty[0].unit && !qty[0].field) {
      // Bare number correction: apply to the field it most resembles.
      const v = qty[0].value;
      m = v <= 35 ? { weightKg: v } : { heightCm: v };
    }
    const d = this.draft;
    if (m.weightKg !== undefined && (overwrite || d.weightKg === undefined)) d.weightKg = m.weightKg;
    if (m.heightCm !== undefined && (overwrite || d.heightCm === undefined)) d.heightCm = m.heightCm;
    if (m.muacCm !== undefined) d.muacCm = m.muacCm;
  }
}
