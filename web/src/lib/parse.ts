// Turns one spoken sentence into structured data.
//
// "Riya Pawar, nau point do kilo, chauhattar centimetre"
//   -> { nameText: "Riya Pawar", weightKg: 9.2, heightCm: 74 }
//
// Works on whatever Chrome speech-to-text returns for mr-IN / hi-IN /
// en-IN: ASCII digits, Devanagari digits, Devanagari number words or
// romanised number words, mixed freely in one sentence. The parser is
// deterministic on purpose: the model transcribes, code decides.
import lexicon from "../data/lexicon.json";

type Lex = Record<string, string[]>;
const L = lexicon as unknown as {
  hi: Lex;
  mr: Lex;
  digits: Record<string, string>;
  fractions: Record<string, { value_op: string; forms: string[] }>;
  decimal_point_words: string[];
  units: Record<"kg" | "g" | "cm" | "mm" | "m", string[]>;
  confirm_yes: string[];
  confirm_no: string[];
};

/** Normalise text the same way for lexicon entries and transcripts. */
export function normalize(text: string): string {
  let s = text.normalize("NFC").replace(/[‌‍़]/g, "").toLowerCase();
  s = s.replace(/[०-९]/g, (d) => L.digits[d] ?? d);
  s = s.replace(/(\d)[.,](\d)/g, "$1\u0001$2"); // keep decimal points inside numbers
  s = s.replace(/[.,!?;:।"'()\-]/g, " ");
  s = s.replace(/\u0001/g, ".");
  s = s.replace(/(\d)([^\d\s.])/g, "$1 $2").replace(/([^\d\s.])(\d)/g, "$1 $2");
  return s.replace(/\s+/g, " ").trim();
}

const EN: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
};

const NUMBER_WORDS = new Map<string, number>();
for (const lang of [L.hi, L.mr]) {
  for (const [n, forms] of Object.entries(lang)) {
    for (const f of forms) {
      const key = normalize(f);
      if (!key.includes(" ") && !NUMBER_WORDS.has(key)) NUMBER_WORDS.set(key, Number(n));
    }
  }
}
for (const [w, n] of Object.entries(EN)) if (!NUMBER_WORDS.has(w)) NUMBER_WORDS.set(w, n);
// Marathi "एकशे" (one hundred) and Hindi "एक सौ" for heights above 100 cm.
for (const w of ["एकशे", "ekshe", "eksho", "एकसौ", "eksau"]) NUMBER_WORDS.set(normalize(w), 100);

const toSet = (forms: string[]) => new Set(forms.map(normalize));
const POINT = toSet(L.decimal_point_words);
const UNIT = new Map<string, keyof typeof L.units>();
for (const [unit, forms] of Object.entries(L.units)) {
  for (const f of forms) UNIT.set(normalize(f).replace(/\s/g, ""), unit as keyof typeof L.units);
}
UNIT.delete("m"); // single letter "m" is too ambiguous in speech
UNIT.delete("g");

interface Frac {
  op: "+" | "-" | "=";
  value: number;
}
const FRACTIONS = new Map<string, Frac>();
for (const { value_op, forms } of Object.values(L.fractions)) {
  const op = value_op[0] as Frac["op"];
  const value = Number(value_op.slice(1));
  for (const f of forms) FRACTIONS.set(normalize(f), { op, value });
}

const YES = toSet(L.confirm_yes.filter((w) => !w.includes(" ")));
const NO = toSet(L.confirm_no.filter((w) => !w.includes(" ")));
YES.delete("हा"); // Marathi "this"; too ambiguous to count as yes
YES.delete("ha");

const WEIGHT_WORDS = toSet(["vajan", "wajan", "vazan", "वजन", "weight", "wt"]);
const HEIGHT_WORDS = toSet([
  "height", "length", "lambai", "lambi", "लंबाई", "लांबी", "उंची", "ऊंचाई", "unchi", "uunchi", "oonchai", "unchai",
]);
const MUAC_WORDS = toSet(["muac", "मुआक", "म्युएक", "dand", "दंड", "baahu", "बाहू", "arm"]);
const FILLER = toSet([
  "ka", "ki", "ke", "cha", "chi", "che", "chya", "का", "की", "के", "चा", "ची", "चे", "च्या",
  "hai", "aahe", "है", "आहे", "the", "is", "and", "aur", "ani", "आणि", "और", "ji", "जी",
]);

type Token =
  | { t: "num"; v: number; en?: boolean }
  | { t: "point" }
  | { t: "frac"; f: Frac }
  | { t: "unit"; u: keyof typeof L.units }
  | { t: "field"; f: "weight" | "height" | "muac" }
  | { t: "word"; w: string };

function splitFractionPrefix(word: string): Token[] | null {
  // Marathi joins the fraction to the number: "साडेतीन", "पावणेचार".
  for (const [form, f] of FRACTIONS) {
    if (f.op === "=" || word.length <= form.length || !word.startsWith(form)) continue;
    const rest = word.slice(form.length);
    const n = NUMBER_WORDS.get(rest);
    if (n !== undefined) return [{ t: "frac", f }, { t: "num", v: n }];
  }
  return null;
}

export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  for (const w of normalize(text).split(" ")) {
    if (!w) continue;
    if (/^\d+(\.\d+)?$/.test(w)) out.push({ t: "num", v: Number(w) });
    else if (POINT.has(w)) out.push({ t: "point" });
    else if (UNIT.has(w)) out.push({ t: "unit", u: UNIT.get(w)! });
    else if (w === "g" || w === "gm") out.push({ t: "unit", u: "g" });
    else if (WEIGHT_WORDS.has(w)) out.push({ t: "field", f: "weight" });
    else if (HEIGHT_WORDS.has(w)) out.push({ t: "field", f: "height" });
    else if (MUAC_WORDS.has(w)) out.push({ t: "field", f: "muac" });
    else if (FRACTIONS.has(w)) out.push({ t: "frac", f: FRACTIONS.get(w)! });
    else if (NUMBER_WORDS.has(w)) out.push({ t: "num", v: NUMBER_WORDS.get(w)!, en: w in EN });
    else out.push(...(splitFractionPrefix(w) ?? [{ t: "word" as const, w }]));
  }
  return out;
}

export interface Quantity {
  value: number;
  unit?: "kg" | "g" | "cm" | "mm" | "m";
  field?: "weight" | "height" | "muac";
}

/** Combine number tokens into quantities ("nau point do kilo" -> 9.2 kg). */
export function quantities(tokens: Token[]): { qty: Quantity[]; words: string[]; firstNumberAt: number } {
  const qty: Quantity[] = [];
  const words: string[] = [];
  let firstNumberAt = -1;
  let pendingField: Quantity["field"];
  let i = 0;

  const readInt = (): number | null => {
    const tok = tokens[i];
    if (!tok) return null;
    if (tok.t === "frac" && tok.f.op === "=") {
      i++;
      return tok.f.value;
    }
    if (tok.t === "frac") {
      const next = tokens[i + 1];
      if (next?.t !== "num") return null;
      i += 2;
      return tok.f.op === "+" ? next.v + tok.f.value : next.v - tok.f.value;
    }
    if (tok.t !== "num") return null;
    let v = tok.v;
    i++;
    // English compounds: "seventy four"
    const nx = tokens[i];
    if (tok.en && v >= 20 && v % 10 === 0 && v < 100 && nx?.t === "num" && nx.en && nx.v < 10) {
      v += nx.v;
      i++;
    }
    // Hundreds: "ek sau bees", "एकशे वीस", "hundred twenty"
    const a = tokens[i];
    if (v < 10 && a?.t === "num" && a.v === 100) {
      v *= 100;
      i++;
    }
    const b = tokens[i];
    if (v % 100 === 0 && v >= 100 && b?.t === "num" && b.v < 100) {
      v += b.v;
      i++;
    }
    return v;
  };

  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok.t === "field") {
      pendingField = tok.f;
      i++;
      continue;
    }
    if (tok.t === "num" || tok.t === "frac") {
      if (firstNumberAt < 0) firstNumberAt = words.length;
      const start = i;
      let value = readInt();
      if (value === null) {
        i = start + 1;
        continue;
      }
      // Decimal part: "point do", "point 2", "point do paanch"
      if (tokens[i]?.t === "point") {
        i++;
        let digits = "";
        while (tokens[i]?.t === "num") {
          const d = (tokens[i] as { v: number }).v;
          if (digits && d >= 10) break;
          digits += String(d);
          i++;
          if (d >= 10) break;
        }
        if (digits) value = Number(`${Math.trunc(value)}.${digits}`);
      }
      const q: Quantity = { value };
      if (tokens[i]?.t === "unit") {
        q.unit = (tokens[i] as { u: Quantity["unit"] }).u;
        i++;
      }
      // "11 kilo 300 gram"
      if (q.unit === "kg" && tokens[i]?.t === "num" && tokens[i + 1]?.t === "unit" &&
          (tokens[i + 1] as { u: string }).u === "g") {
        q.value = value + (tokens[i] as { v: number }).v / 1000;
        i += 2;
      }
      if (pendingField) {
        q.field = pendingField;
        pendingField = undefined;
      }
      qty.push(q);
      continue;
    }
    if (tok.t === "word") words.push(tok.w);
    i++;
  }
  return { qty, words, firstNumberAt };
}

export interface Measurement {
  weightKg?: number;
  heightCm?: number;
  muacCm?: number;
  oedema?: boolean; // bilateral pitting oedema reported by the worker
}

const OEDEMA = toSet(["oedema", "edema", "सूज", "soojan", "sujan", "sooj", "suj", "सूजन", "puffy", "swelling"]);
const NEGATE = toSet(["nahi", "नाही", "नहीं", "no", "नही", "nai"]);

/** "paayala sooj aahe" -> true, "sooj nahi" -> false, no mention -> undefined. */
export function detectOedema(text: string): boolean | undefined {
  const words = normalize(text).split(" ");
  const i = words.findIndex((w) => OEDEMA.has(w));
  if (i < 0) return undefined;
  const near = words.slice(i + 1, i + 4);
  return !near.some((w) => NEGATE.has(w));
}

/** Decide which quantity is weight, height or MUAC. */
export function assignFields(qty: Quantity[]): Measurement {
  const m: Measurement = {};
  const rest: Quantity[] = [];
  for (const q of qty) {
    if (q.field === "muac") m.muacCm = q.unit === "mm" ? q.value / 10 : q.value;
    else if (q.unit === "kg" || q.field === "weight") m.weightKg ??= q.value;
    else if (q.unit === "g") m.weightKg ??= q.value >= 1000 ? q.value / 1000 : q.value;
    else if (q.unit === "cm" || q.unit === "mm" || q.unit === "m" || q.field === "height") {
      const cm = q.unit === "mm" ? q.value / 10 : q.unit === "m" ? q.value * 100 : q.value;
      m.heightCm ??= cm;
    } else rest.push(q);
  }
  // No unit spoken: children under five weigh < 35 kg and are > 35 cm long.
  for (const q of rest) {
    if (q.value <= 35 && m.weightKg === undefined) m.weightKg = q.value;
    else if (m.heightCm === undefined) m.heightCm = q.value;
    else if (m.weightKg === undefined) m.weightKg = q.value;
  }
  return m;
}

export type Intent =
  | "start" | "stop" | "pending" | "undo" | "yes" | "no" | "help" | "other";

const has = (words: string[], set: Set<string>) => words.some((w) => set.has(w));
const START = toSet(["shuru", "शुरू", "सुरू", "suru", "start", "chalu", "चालू", "begin"]);
const STOP = toSet(["band", "बंद", "stop", "samapt", "समाप्त", "khatam", "खतम", "संपले", "finish", "end"]);
const PENDING = toSet(["baaki", "baki", "बाकी", "remaining", "pending", "uralele", "उरलेले"]);
const UNDO = toSet(["radd", "रद्द", "undo", "wapas", "vapas", "वापस", "cancel", "hatao", "हटाओ"]);
const HELP = toSet(["madat", "मदत", "madad", "मदद", "help"]);

export function detectIntent(text: string): Intent {
  const words = normalize(text).split(" ");
  if (has(words, NO)) return "no"; // "barobar nahi" must win over "barobar"
  if (has(words, UNDO)) return "undo";
  if (has(words, PENDING)) return "pending";
  if (has(words, STOP)) return "stop";
  if (has(words, START)) return "start";
  if (has(words, HELP)) return "help";
  if (has(words, YES)) return "yes";
  return "other";
}

export interface ParsedUtterance {
  intent: Intent;
  nameText: string; // words before the first number, e.g. "riya pawar"
  measurement: Measurement;
  raw: string;
}

export function parseUtterance(text: string): ParsedUtterance {
  const tokens = tokenize(text);
  const { qty, words, firstNumberAt } = quantities(tokens);
  const nameWords = (firstNumberAt >= 0 ? words.slice(0, firstNumberAt) : words).filter(
    (w) => !FILLER.has(w) && !YES.has(w) && !NO.has(w)
  );
  const measurement = assignFields(qty);
  const oedema = detectOedema(text);
  if (oedema !== undefined) measurement.oedema = oedema;
  return {
    intent: detectIntent(text),
    nameText: nameWords.filter((w) => !OEDEMA.has(w)).join(" "),
    measurement,
    raw: text,
  };
}
