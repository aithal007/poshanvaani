// WHO Child Growth Standards (2006) z-scores using the LMS method,
// including WHO's restricted adjustment beyond ±3 SD for weight-based
// indicators, as implemented in the WHO Anthro software.
//
// Classification follows India's 2023 MoWCD + MoHFW protocol for
// management of malnutrition (children 6–59 months):
//   SAM: WHZ < −3, or MUAC < 11.5 cm, or bilateral pitting oedema
//   MAM: −3 ≤ WHZ < −2, or 11.5 ≤ MUAC < 12.5 cm
import lms from "../data/who-lms.json";

export type Sex = "M" | "F";
type LMS = [number, number, number];

interface SizeTable {
  start: number;
  step: number;
  rows: LMS[];
}

const table = lms as unknown as {
  wfa: Record<string, LMS[]>;
  lhfa: Record<string, LMS[]>;
  wfl: Record<string, SizeTable>;
  wfh: Record<string, SizeTable>;
};

const sexKey = (sex: Sex) => (sex === "M" ? "1" : "2");

/** Plain LMS z-score. */
export function lmsZ(x: number, [l, m, s]: LMS): number {
  if (l === 0) return Math.log(x / m) / s;
  return (Math.pow(x / m, l) - 1) / (l * s);
}

/** WHO restricted z-score for weight-based indicators (|z| > 3 rescaled). */
export function restrictedZ(x: number, p: LMS): number {
  const [l, m, s] = p;
  const z = lmsZ(x, p);
  const sd = (k: number) => m * Math.pow(1 + l * s * k, 1 / l);
  if (z > 3) {
    const sd3 = sd(3);
    return 3 + (x - sd3) / (sd3 - sd(2));
  }
  if (z < -3) {
    const sd3neg = sd(-3);
    return -3 + (x - sd3neg) / (sd(-2) - sd3neg);
  }
  return z;
}

/** Linear interpolation of LMS between 0.1 cm rows. */
function lmsAtSize(t: SizeTable, cm: number): LMS | null {
  const pos = (cm - t.start) / t.step;
  if (pos < 0 || pos > t.rows.length - 1) return null;
  const i = Math.floor(pos + 1e-9);
  const f = pos - i;
  const a = t.rows[i];
  const b = t.rows[Math.min(i + 1, t.rows.length - 1)];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

export const DAYS_24_MONTHS = 731;
export const MAX_AGE_DAYS = 1826;

export interface ZScores {
  waz: number | null;
  haz: number | null;
  whz: number | null;
}

/**
 * Compute WAZ, HAZ and WHZ.
 * `lying` = measured lying down (recumbent length). If omitted, the WHO
 * recommended position for the age is assumed (lying below 24 months).
 */
export function zScores(
  sex: Sex,
  ageDays: number,
  weightKg: number,
  heightCm: number,
  lying?: boolean
): ZScores {
  const age = Math.round(ageDays);
  const k = sexKey(sex);
  const inRange = age >= 0 && age <= MAX_AGE_DAYS;
  const under2 = age < DAYS_24_MONTHS;
  const measuredLying = lying ?? under2;

  // WHO rule: length = height + 0.7 cm. Convert to the expected position.
  let h = heightCm;
  if (under2 && !measuredLying) h += 0.7;
  if (!under2 && measuredLying) h -= 0.7;

  const waz = inRange && weightKg > 0 ? restrictedZ(weightKg, table.wfa[k][age]) : null;
  const haz = inRange && h > 0 ? lmsZ(h, table.lhfa[k][age]) : null;

  const sizeTable = under2 ? table.wfl[k] : table.wfh[k];
  const p = weightKg > 0 ? lmsAtSize(sizeTable, Math.round(h * 10) / 10) : null;
  const whz = p ? restrictedZ(weightKg, p) : null;

  return { waz: round2(waz), haz: round2(haz), whz: round2(whz) };
}

const round2 = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);

/** Median (M) and ±2/±3 SD weights for a given age, used to draw bands. */
export function weightForAgeBands(sex: Sex, ageDays: number) {
  const p = table.wfa[sexKey(sex)][Math.min(Math.max(Math.round(ageDays), 0), MAX_AGE_DAYS)];
  const [l, m, s] = p;
  const sd = (k: number) => m * Math.pow(1 + l * s * k, 1 / l);
  return { m3: sd(-3), m2: sd(-2), median: m, p2: sd(2), p3: sd(3) };
}

/** Inverse LMS: the measurement at a given z-score (for bands and demo data). */
export function valueAtZ(indicator: "wfa" | "lhfa", sex: Sex, ageDays: number, z: number): number {
  const age = Math.min(Math.max(Math.round(ageDays), 0), MAX_AGE_DAYS);
  const [l, m, s] = table[indicator][sexKey(sex)][age];
  return l === 0 ? m * Math.exp(s * z) : m * Math.pow(1 + l * s * z, 1 / l);
}

export type Status = "normal" | "mam" | "sam";

export interface Classification {
  status: Status; // acute malnutrition (wasting / MUAC)
  underweight: "normal" | "moderate" | "severe";
  stunting: "normal" | "moderate" | "severe";
  flags: string[]; // biologically implausible z-scores (WHO data-quality rule)
}

const grade = (z: number | null) =>
  z === null ? "normal" : z < -3 ? "severe" : z < -2 ? "moderate" : "normal";

export function classify(z: ZScores, muacCm?: number | null, ageDays?: number): Classification {
  let status: Status = "normal";
  const muacApplies = muacCm != null && (ageDays === undefined || ageDays >= 183);
  if ((z.whz !== null && z.whz < -3) || (muacApplies && muacCm! < 11.5)) status = "sam";
  else if ((z.whz !== null && z.whz < -2) || (muacApplies && muacCm! < 12.5)) status = "mam";

  const flags: string[] = [];
  if (z.waz !== null && (z.waz < -6 || z.waz > 5)) flags.push("waz");
  if (z.haz !== null && (z.haz < -6 || z.haz > 6)) flags.push("haz");
  if (z.whz !== null && (z.whz < -5 || z.whz > 5)) flags.push("whz");

  return { status, underweight: grade(z.waz), stunting: grade(z.haz), flags };
}

export function ageInDays(dob: string, on: Date = new Date()): number {
  const d = new Date(dob + "T00:00:00");
  return Math.floor((on.getTime() - d.getTime()) / 86400000);
}

export const ageInMonths = (days: number) => Math.floor(days / 30.4375);
