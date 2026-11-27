import { describe, expect, it } from "vitest";
import { assessQuality, digitPreferenceScore, dpsBand, type QualityRow } from "./quality";

const row = (childId: string, date: string, weightKg: number, heightCm: number, engine = "webspeech"): QualityRow => ({
  childId, date, weightKg, heightCm, whz: -0.5, haz: -0.8, waz: -0.6, engine, transcript: "",
});

describe("digit preference score", () => {
  it("is near 0 for evenly spread last digits", () => {
    const values = Array.from({ length: 100 }, (_, i) => 8 + (i % 10) / 10);
    expect(digitPreferenceScore(values).dps).toBeLessThan(1);
  });

  it("is high when everything is rounded to .0 or .5", () => {
    const values = Array.from({ length: 40 }, (_, i) => 8 + (i % 2) * 0.5);
    const r = digitPreferenceScore(values);
    expect(r.counts[0]).toBe(20);
    expect(r.counts[5]).toBe(20);
    expect(dpsBand(r.dps)).toBe("problematic");
  });
});

describe("assessQuality", () => {
  it("scores honest live voice data highly", () => {
    const rows = Array.from({ length: 30 }, (_, i) => row(`c${i}`, "2026-11-27", 8 + i * 0.13, 70 + i * 0.37));
    const r = assessQuality(rows, rows);
    expect(r.liveVoiceShare).toBe(1);
    expect(r.verdict).toBe("trustworthy");
  });

  it("flags copied heights, duplicates and heaping", () => {
    const prev = Array.from({ length: 20 }, (_, i) => row(`c${i}`, "2026-10-27", 9, 75 + (i % 3), "manual"));
    const cur = Array.from({ length: 20 }, (_, i) => row(`c${i}`, "2026-11-27", 9.5, 75 + (i % 3), "manual"));
    const r = assessQuality(cur, [...prev, ...cur]);
    expect(r.copiedHeights).toBe(20);
    expect(r.duplicates).toBeGreaterThan(0);
    expect(r.liveVoiceShare).toBe(0);
    expect(r.verdict).toBe("unreliable");
  });

  it("counts biologically implausible z-scores", () => {
    const bad = { ...row("x", "2026-11-27", 9, 28), haz: -9 };
    expect(assessQuality([bad], [bad]).implausible).toBe(1);
  });
});
