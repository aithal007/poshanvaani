// Plausibility checks run BEFORE a reading is saved, while the child is
// still on the scale. They catch the errors that today get typed into
// Poshan Tracker hours later and are hard to undo: digit swaps (28 vs 82),
// a missed decimal point (92 vs 9.2), grams vs kilograms, and impossible
// month-on-month changes.
//
// Monthly limits are derived from the WHO Child Growth Standards velocity
// tables (+3 SD 1-month weight increments, 2-month length increments).

export interface Reading {
  weightKg: number | null;
  heightCm: number | null;
}

export interface PreviousReading {
  weightKg: number;
  heightCm: number;
  date: string; // ISO date
}

export type Field = "weightKg" | "heightCm";

export interface Issue {
  field: Field;
  kind: "range" | "drop" | "jump";
  value: number;
  previous?: number;
  suggestion?: number; // most likely intended value
}

export const WEIGHT_RANGE = { min: 1.5, max: 30 };
export const HEIGHT_RANGE = { min: 45, max: 125 };

/** Largest plausible monthly weight gain (kg) by age, ~WHO +3 SD velocity. */
export function maxMonthlyWeightGain(ageMonths: number): number {
  if (ageMonths < 2) return 2.2;
  if (ageMonths < 3) return 1.6;
  if (ageMonths < 6) return 1.3;
  if (ageMonths < 12) return 1.0;
  return 0.9;
}

/** Largest plausible monthly length/height gain (cm) by age. */
export function maxMonthlyHeightGain(ageMonths: number): number {
  if (ageMonths < 2) return 6.0;
  if (ageMonths < 4) return 4.3;
  if (ageMonths < 6) return 3.3;
  if (ageMonths < 12) return 2.8;
  if (ageMonths < 24) return 2.5;
  return 1.8;
}

/** Plausible monthly loss before we ask for a re-measure. */
export const MAX_MONTHLY_WEIGHT_LOSS_FRACTION = 0.1;
/** Height cannot shrink beyond measurement error. */
export const MAX_HEIGHT_DROP_CM = 1.0;

function monthsBetween(fromIso: string, to: Date): number {
  const days = (to.getTime() - new Date(fromIso + "T00:00:00").getTime()) / 86400000;
  return Math.max(days / 30.4375, 0.5);
}

function bounds(field: Field, prev: PreviousReading | undefined, ageMonths: number, today: Date) {
  const r = field === "weightKg" ? WEIGHT_RANGE : HEIGHT_RANGE;
  if (!prev) return { lo: r.min, hi: r.max, expected: undefined as number | undefined };
  const months = monthsBetween(prev.date, today);
  if (field === "weightKg") {
    const lo = prev.weightKg * (1 - MAX_MONTHLY_WEIGHT_LOSS_FRACTION * Math.max(1, months)) - 0.1;
    const hi = prev.weightKg + maxMonthlyWeightGain(ageMonths) * months + 0.2;
    return { lo: Math.max(lo, r.min), hi: Math.min(hi, r.max), expected: prev.weightKg };
  }
  const lo = prev.heightCm - MAX_HEIGHT_DROP_CM;
  const hi = prev.heightCm + maxMonthlyHeightGain(ageMonths) * months + 1.0;
  return { lo: Math.max(lo, r.min), hi: Math.min(hi, r.max), expected: prev.heightCm };
}

/**
 * Alternatives a listener or a tired hand could have produced instead of
 * the intended value: swapped digits, a lost or extra decimal point,
 * grams spoken as kilograms, and one-digit slips.
 */
export function candidates(value: number, field: Field): number[] {
  const out = new Set<number>();
  const add = (n: number) => {
    if (Number.isFinite(n) && n > 0) out.add(Math.round(n * 10) / 10);
  };
  const [intPart, decPart = ""] = String(value).split(".");

  // Swap the integer digits: 28 -> 82, 117 -> 171 / 711
  if (intPart.length >= 2) {
    const d = intPart.split("");
    for (let i = 0; i < d.length - 1; i++) {
      const s = [...d];
      [s[i], s[i + 1]] = [s[i + 1], s[i]];
      add(Number(s.join("") + (decPart ? "." + decPart : "")));
    }
  }
  // Decimal point lost or misplaced: 92 -> 9.2, 112 -> 11.2, 1.12 -> 11.2
  add(value / 10);
  add(value * 10);
  if (field === "weightKg") {
    add(value / 1000); // 11300 (grams) -> 11.3
    add(value / 100);
  }
  // Digits swapped across the point: 9.2 -> 2.9
  if (decPart.length === 1 && intPart.length === 1) add(Number(decPart + "." + intPart));
  // Hindi/Marathi "-ties" are easily misheard: 70 vs 17, 60 vs 16 etc.
  if (field === "heightCm" && intPart.length === 2) {
    add(Number(intPart[1] + intPart[0]));
  }
  out.delete(Math.round(value * 10) / 10);
  return [...out];
}

export function checkReading(
  reading: Reading,
  prev: PreviousReading | undefined,
  ageMonths: number,
  today: Date = new Date()
): Issue[] {
  const issues: Issue[] = [];
  for (const field of ["weightKg", "heightCm"] as Field[]) {
    const value = reading[field];
    if (value == null) continue;
    const b = bounds(field, prev, ageMonths, today);
    if (value >= b.lo && value <= b.hi) continue;

    const range = field === "weightKg" ? WEIGHT_RANGE : HEIGHT_RANGE;
    const kind: Issue["kind"] =
      value < range.min || value > range.max ? "range" : value < b.lo ? "drop" : "jump";

    // Pick the plausible alternative closest to what we expected.
    const target = b.expected ?? (b.lo + b.hi) / 2;
    const suggestion = candidates(value, field)
      .filter((c) => c >= b.lo && c <= b.hi)
      .sort((x, y) => Math.abs(x - target) - Math.abs(y - target))[0];

    issues.push({
      field,
      kind,
      value,
      previous: b.expected,
      suggestion,
    });
  }
  return issues;
}

/** Growth faltering: weight not gained (or lost) since the last visit. */
export function isFaltering(weightKg: number, prev: PreviousReading | undefined): boolean {
  return !!prev && weightKg <= prev.weightKg;
}
