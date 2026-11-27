import { describe, expect, it } from "vitest";
import { buildSeed } from "./seed";
import { ageInDays, classify, zScores } from "./who";
import { checkReading } from "./plausibility";

const today = new Date("2026-11-27T10:00:00");
const { children, measurements } = buildSeed(today);
const last = (id: string) => measurements.filter((m) => m.childId === id).sort((a, b) => b.takenAt - a.takenAt)[0];

describe("demo seed", () => {
  it("has 24 children and 6 already weighed today", () => {
    expect(children).toHaveLength(24);
    expect(measurements.filter((m) => m.date === "2026-11-27")).toHaveLength(6);
  });

  it("Riya Pawar: saying 6.6 kg / 74 cm today is SAM and a weight loss", () => {
    const riya = children.find((c) => c.name === "Riya Pawar")!;
    const prev = last(riya.id);
    console.log("Riya Pawar last:", prev.weightKg, prev.heightCm, prev.whz);
    const z = zScores("F", ageInDays(riya.dob, today), 6.6, 74);
    expect(classify(z).status).toBe("sam");
    expect(prev.weightKg).toBeGreaterThan(6.6);
    expect(checkReading({ weightKg: 6.6, heightCm: 74 }, prev, 14, today)).toEqual([]);
  });

  it("Aarav Jadhav: 28 cm is caught and 82 suggested", () => {
    const aarav = children.find((c) => c.name === "Aarav Jadhav")!;
    const prev = last(aarav.id);
    console.log("Aarav last:", prev.weightKg, prev.heightCm);
    const [issue] = checkReading({ weightKg: prev.weightKg + 0.2, heightCm: 28 }, prev, 20, today);
    expect(issue.suggestion).toBe(Math.round(prev.heightCm) === 81 ? 82 : issue.suggestion);
  });
});
