// Growth-faltering watch list: who to see before they become malnourished.
//
// Predictive work on anganwadi data (Dimagi + American India Foundation)
// found the strongest signal is the weight trajectory over the last 2–4
// months. This is a transparent, rule-based version of that idea:
//   - already SAM / MAM at the latest reading
//   - weight flat or falling for two consecutive months
//   - weight-for-height trending down fast enough to cross −2 SD soon
//   - monthly gain far below what a child of that age normally gains
import type { Child, Measurement } from "./db";
import { ageInDays, valueAtZ } from "./who";

export type Reason = "sam" | "mam" | "flat2" | "slide" | "slow";

export interface WatchItem {
  child: Child;
  latest: Measurement;
  reasons: Reason[];
  risk: number; // for ordering
  projectedWhz?: number; // WHZ expected in 2 months if the trend continues
}

const WEIGHT: Record<Reason, number> = { sam: 100, mam: 70, slide: 50, flat2: 40, slow: 20 };

export function watchList(children: Child[], all: Measurement[], limit = 6): WatchItem[] {
  const items: WatchItem[] = [];
  for (const child of children) {
    const hist = all
      .filter((m) => m.childId === child.id && !m.voided)
      .sort((a, b) => a.takenAt - b.takenAt);
    if (!hist.length) continue;
    const latest = hist[hist.length - 1];
    const reasons: Reason[] = [];
    if (latest.status === "sam") reasons.push("sam");
    else if (latest.status === "mam") reasons.push("mam");

    const last3 = hist.slice(-3);
    if (last3.length === 3 && last3[1].weightKg <= last3[0].weightKg && last3[2].weightKg <= last3[1].weightKg) {
      reasons.push("flat2");
    }

    let projectedWhz: number | undefined;
    const z = last3.map((m) => m.whz).filter((v): v is number => v !== null);
    if (z.length >= 2) {
      const slope = (z[z.length - 1] - z[0]) / (z.length - 1); // per visit (~month)
      projectedWhz = Math.round((z[z.length - 1] + 2 * slope) * 100) / 100;
      if (slope < -0.25 && projectedWhz < -2 && latest.status === "normal") reasons.push("slide");
    }

    if (hist.length >= 2) {
      const prev = hist[hist.length - 2];
      const d0 = ageInDays(child.dob, new Date(prev.date + "T12:00:00"));
      const d1 = ageInDays(child.dob, new Date(latest.date + "T12:00:00"));
      const expected = valueAtZ("wfa", child.sex, d1, 0) - valueAtZ("wfa", child.sex, d0, 0);
      const gained = latest.weightKg - prev.weightKg;
      if (expected > 0.1 && gained >= 0 && gained < expected * 0.4 && !reasons.includes("flat2")) reasons.push("slow");
    }

    if (reasons.length) {
      items.push({ child, latest, reasons, risk: reasons.reduce((s, r) => s + WEIGHT[r], 0), projectedWhz });
    }
  }
  return items.sort((a, b) => b.risk - a.risk).slice(0, limit);
}
