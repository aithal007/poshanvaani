// Data honesty score: is this centre's growth data real?
//
// Uses the anthropometric data-quality checks recommended by WHO/UNICEF
// (2019, "Recommendations for data collection, analysis and reporting on
// anthropometric indicators") and the SMART plausibility check:
//   - Digit preference score (DPS) on the last decimal digit of weight and
//     height: numbers typed later from memory or rounded heap on .0 and .5.
//   - Copied values: a child under five cannot have exactly the same height
//     as last month.
//   - Duplicate readings across different children.
//   - Biologically implausible z-scores (WHZ ±5, HAZ ±6, WAZ −6/+5).
//   - SD of WHZ (expected ~0.8–1.2; too low means "too uniform").
// Plus PoshanVaani's own signal: provenance, i.e. how many readings were
// captured live by voice at the scale versus typed in later.

export interface QualityRow {
  childId: string;
  date: string;
  weightKg: number;
  heightCm: number;
  whz: number | null;
  haz: number | null;
  waz: number | null;
  engine: string; // "webspeech" | "sarvam" | "manual"
  transcript: string;
}

/**
 * WHO MONICA / SMART digit preference score, 0 (none) .. 100 (all one digit).
 * `adjusted` subtracts the value expected by chance for this sample size
 * (E[chi2] = df under uniform digits, so DPS ≈ 100/sqrt(n)): one centre has
 * only 20–40 children, where the raw score is inflated.
 */
export function digitPreferenceScore(values: number[]): { dps: number; adjusted: number; counts: number[] } {
  const counts = Array(10).fill(0) as number[];
  for (const v of values) counts[Math.round(v * 10) % 10]++;
  const n = values.length;
  if (n === 0) return { dps: 0, adjusted: 0, counts };
  const expected = n / 10;
  const chi2 = counts.reduce((s, o) => s + (o - expected) ** 2 / expected, 0);
  const dps = 100 * Math.sqrt(chi2 / (9 * n));
  const adjusted = Math.max(0, dps - 100 / Math.sqrt(n));
  return { dps: Math.round(dps * 10) / 10, adjusted: Math.round(adjusted * 10) / 10, counts };
}

/** SMART bands for DPS. */
export const dpsBand = (dps: number) =>
  dps <= 7 ? "excellent" : dps <= 12 ? "good" : dps <= 20 ? "acceptable" : "problematic";

export function sd(values: number[]): number | null {
  if (values.length < 3) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const v = values.reduce((s, x) => s + (x - mean) ** 2, 0) / (values.length - 1);
  return Math.round(Math.sqrt(v) * 100) / 100;
}

export interface QualityReport {
  n: number;
  weightDps: number; // small-sample adjusted
  heightDps: number; // small-sample adjusted
  weightDigits: number[];
  heightDigits: number[];
  copiedHeights: number; // same height as the child's previous reading
  duplicates: number; // identical weight+height pair shared by different children
  implausible: number;
  whzSd: number | null;
  liveVoiceShare: number; // 0..1 captured by voice at the scale
  score: number; // 0..100, higher = more trustworthy
  verdict: "trustworthy" | "check" | "unreliable";
}

/**
 * `current`: readings to assess (e.g. one month). `history`: all readings,
 * used to find each child's previous value.
 */
export function assessQuality(current: QualityRow[], history: QualityRow[]): QualityReport {
  const n = current.length;
  const w = digitPreferenceScore(current.map((r) => r.weightKg));
  const h = digitPreferenceScore(current.map((r) => r.heightCm));

  let copiedHeights = 0;
  for (const r of current) {
    const prev = history
      .filter((p) => p.childId === r.childId && p.date < r.date)
      .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    if (prev && prev.heightCm === r.heightCm) copiedHeights++;
  }

  const pairs = new Map<string, Set<string>>();
  for (const r of current) {
    const key = `${r.weightKg}|${r.heightCm}`;
    if (!pairs.has(key)) pairs.set(key, new Set());
    pairs.get(key)!.add(r.childId);
  }
  let duplicates = 0;
  for (const ids of pairs.values()) if (ids.size > 1) duplicates += ids.size;

  const implausible = current.filter(
    (r) =>
      (r.whz !== null && Math.abs(r.whz) > 5) ||
      (r.haz !== null && Math.abs(r.haz) > 6) ||
      (r.waz !== null && (r.waz < -6 || r.waz > 5))
  ).length;

  const whzSd = sd(current.map((r) => r.whz).filter((z): z is number => z !== null));
  const live = current.filter((r) => r.engine !== "manual").length;
  const liveVoiceShare = n ? live / n : 0;

  // Penalties out of 100. DPS penalties start above the SMART "good" band.
  const meanDps = (w.adjusted + h.adjusted) / 2;
  let score = 100;
  score -= Math.min(40, Math.max(0, meanDps - 7) * 2);
  score -= n ? Math.min(30, (copiedHeights / n) * 100) : 0;
  score -= Math.min(15, duplicates * 3);
  score -= Math.min(20, implausible * 10);
  if (whzSd !== null && n >= 10 && whzSd < 0.6) score -= 10; // suspiciously uniform
  score = Math.max(0, Math.round(score));

  return {
    n,
    weightDps: w.adjusted,
    heightDps: h.adjusted,
    weightDigits: w.counts,
    heightDigits: h.counts,
    copiedHeights,
    duplicates,
    implausible,
    whzSd,
    liveVoiceShare,
    score,
    verdict: score >= 75 ? "trustworthy" : score >= 50 ? "check" : "unreliable",
  };
}
