// Matching a spoken child name against the centre roster.
//
// Speech-to-text may return a name in Devanagari ("रिया पवार") or in Latin
// script ("Riya Pawar", "Reeya Powar"). Both the roster and the transcript
// are transliterated to a rough Latin form, reduced to a phonetic key, and
// compared with edit distance, so small accent and spelling differences
// still match.

const VOWELS: Record<string, string> = {
  अ: "a", आ: "aa", इ: "i", ई: "ee", उ: "u", ऊ: "oo", ऋ: "ri", ए: "e", ऐ: "ai",
  ओ: "o", औ: "au", ऑ: "o", अं: "am",
};
const MATRAS: Record<string, string> = {
  "ा": "aa", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo", "ृ": "ri", "े": "e", "ै": "ai",
  "ो": "o", "ौ": "au", "ॉ": "o", "ॅ": "e",
};
const CONSONANTS: Record<string, string> = {
  क: "k", ख: "kh", ग: "g", घ: "gh", ङ: "n", च: "ch", छ: "chh", ज: "j", झ: "jh", ञ: "n",
  ट: "t", ठ: "th", ड: "d", ढ: "dh", ण: "n", त: "t", थ: "th", द: "d", ध: "dh", न: "n",
  प: "p", फ: "ph", ब: "b", भ: "bh", म: "m", य: "y", र: "r", ल: "l", ळ: "l", व: "v",
  श: "sh", ष: "sh", स: "s", ह: "h", क़: "k", ख़: "kh", ग़: "g", ज़: "z", ड़: "d", ढ़: "dh", फ़: "f",
};
const VIRAMA = "्";
const NUKTA = "़";
const ANUSVARA = "ं";
const CANDRABINDU = "ँ";
const VISARGA = "ः";

/** Transliterate Devanagari to a simple Latin form; Latin text passes through. */
export function toLatin(text: string): string {
  const s = text.normalize("NFC");
  let out = "";
  for (let i = 0; i < s.length; i++) {
    let ch = s[i];
    if (s[i + 1] === NUKTA) {
      ch = ch + NUKTA;
      i++;
    }
    if (CONSONANTS[ch] !== undefined) {
      out += CONSONANTS[ch];
      const next = s[i + 1];
      if (next === VIRAMA) {
        i++;
      } else if (next && MATRAS[next] !== undefined) {
        out += MATRAS[next];
        i++;
      } else if (next && CONSONANTS[next] !== undefined) {
        out += "a"; // inherent vowel between consonants
      } else if (!next || /\s/.test(next)) {
        // word-final inherent vowel is silent in Hindi/Marathi
      } else {
        out += "a";
      }
    } else if (VOWELS[ch] !== undefined) {
      out += VOWELS[ch];
    } else if (ch === ANUSVARA || ch === CANDRABINDU) {
      out += "n";
    } else if (ch === VISARGA) {
      out += "h";
    } else {
      out += ch;
    }
  }
  return out;
}

/** Reduce a name to a phonetic key that ignores common spelling variation. */
export function phoneticKey(name: string): string {
  return toLatin(name)
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .replace(/w/g, "v")
    .replace(/ph/g, "f")
    .replace(/z/g, "j")
    .replace(/sh/g, "s")
    .replace(/(kh|gh|chh|ch|th|dh|bh|jh)/g, (m) => m[0])
    .replace(/ee|ii|y(?=a)/g, (m) => (m === "y" ? "y" : "i"))
    .replace(/oo|uu/g, "u")
    .replace(/aa/g, "a")
    .replace(/ou|au/g, "o")
    .replace(/(.)\1+/g, "$1")
    .replace(/h(?=\s|$)/g, "")
    .replace(/a(?=\s|$)/g, "") // final schwa: "riya" ~ "riy"
    .replace(/\s+/g, " ")
    .trim();
}

export function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[a.length][b.length];
}

/** Similarity 0..1 between two phonetic keys. */
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  return 1 - editDistance(a, b) / Math.max(a.length, b.length);
}

export interface NamedChild {
  id: string;
  name: string; // "Riya Pawar"
  nameLocal?: string; // "रिया पवार"
  parentName?: string;
}

export interface NameMatch<T extends NamedChild> {
  child: T;
  score: number;
}

/**
 * Score every child against the spoken words. A spoken first name alone
 * ("Riya") matches all Riyas; adding the surname ("Riya Pawar") or the
 * parent's name narrows it down.
 */
export function matchChildren<T extends NamedChild>(spoken: string, roster: T[]): NameMatch<T>[] {
  const words = phoneticKey(spoken).split(" ").filter((w) => w.length > 1);
  if (!words.length) return [];

  const scored = roster.map((child) => {
    const parts = phoneticKey(child.name).split(" ");
    const parent = child.parentName ? phoneticKey(child.parentName).split(" ") : [];
    const firstScore = Math.max(...words.map((w) => similarity(w, parts[0])));
    const otherNames = [...parts.slice(1), ...parent];
    const extra = otherNames.length
      ? Math.max(0, ...words.map((w) => Math.max(...otherNames.map((p) => similarity(w, p)))))
      : 0;
    // First name dominates; a matching surname or parent name breaks ties.
    const score = firstScore >= 0.6 ? firstScore + (extra >= 0.75 ? 0.5 * extra : 0) : 0;
    return { child, score };
  });

  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
}

export type NameResult<T extends NamedChild> =
  | { kind: "match"; child: T }
  | { kind: "ambiguous"; options: T[] }
  | { kind: "none" };

export function resolveName<T extends NamedChild>(spoken: string, roster: T[]): NameResult<T> {
  const ranked = matchChildren(spoken, roster);
  if (!ranked.length) return { kind: "none" };
  const best = ranked[0].score;
  const close = ranked.filter((r) => best - r.score < 0.15);
  if (close.length === 1) return { kind: "match", child: close[0].child };
  return { kind: "ambiguous", options: close.slice(0, 3).map((r) => r.child) };
}

/**
 * Pick one child from a short list after a follow-up answer such as
 * "Pawar", "Sunil chi mulgi" or "pahili" (the first one).
 */
export function pickFromOptions<T extends NamedChild>(answer: string, options: T[]): T | null {
  const key = phoneticKey(answer);
  const ordinals: [RegExp, number][] = [
    [/\b(pahil|pehl|first)|\b(ek|1)\b/, 0],
    [/\b(dusr|dusar|second)|\b(don|do|2)\b/, 1],
    [/\b(tisr|tisar|third)|\b(tin|3)\b/, 2],
  ];
  for (const [re, idx] of ordinals) if (re.test(key) && options[idx]) return options[idx];
  const words = key.split(" ").filter((w) => w.length > 2);
  if (!words.length) return null;
  // Compare against surname and parent name: the parts that differ.
  const ranked = options
    .map((o) => {
      const parts = [
        ...phoneticKey(o.name).split(" ").slice(1),
        ...(o.parentName ? phoneticKey(o.parentName).split(" ") : []),
      ];
      const score = Math.max(0, ...words.map((w) => Math.max(0, ...parts.map((p) => similarity(w, p)))));
      return { o, score };
    })
    .sort((a, b) => b.score - a.score);
  const [top, second] = ranked;
  if (top.score >= 0.7 && (!second || top.score - second.score > 0.15)) return top.o;
  return null;
}
