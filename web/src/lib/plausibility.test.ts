import { describe, expect, it } from "vitest";
import { candidates, checkReading, isFaltering } from "./plausibility";

const today = new Date("2026-11-27T10:00:00");
const lastMonth = { weightKg: 11.0, heightCm: 81, date: "2026-10-27" };

describe("plausibility", () => {
  it("accepts a normal month-on-month reading", () => {
    expect(checkReading({ weightKg: 11.2, heightCm: 82 }, lastMonth, 30, today)).toEqual([]);
  });

  it("catches a digit swap in height and suggests the intended value", () => {
    const [issue] = checkReading({ weightKg: 11.2, heightCm: 28 }, lastMonth, 30, today);
    expect(issue.field).toBe("heightCm");
    expect(issue.suggestion).toBe(82);
  });

  it("catches a lost decimal point in weight", () => {
    const [issue] = checkReading({ weightKg: 112, heightCm: 82 }, lastMonth, 30, today);
    expect(issue.kind).toBe("range");
    expect(issue.suggestion).toBe(11.2);
  });

  it("catches grams spoken as kilograms", () => {
    const [issue] = checkReading({ weightKg: 11300, heightCm: 82 }, lastMonth, 30, today);
    expect(issue.suggestion).toBe(11.3);
  });

  it("flags a height that shrank", () => {
    const [issue] = checkReading({ weightKg: 11.1, heightCm: 78 }, lastMonth, 30, today);
    expect(issue.kind).toBe("drop");
  });

  it("flags an impossible weight jump", () => {
    const [issue] = checkReading({ weightKg: 14.5, heightCm: 82 }, lastMonth, 30, today);
    expect(issue.kind).toBe("jump");
  });

  it("works without history using absolute ranges", () => {
    expect(checkReading({ weightKg: 9.2, heightCm: 74 }, undefined, 14, today)).toEqual([]);
    expect(checkReading({ weightKg: 92, heightCm: 74 }, undefined, 14, today)[0].suggestion).toBe(9.2);
  });

  it("generates swap and decimal candidates", () => {
    expect(candidates(28, "heightCm")).toContain(82);
    expect(candidates(92, "weightKg")).toContain(9.2);
  });

  it("detects growth faltering", () => {
    expect(isFaltering(10.9, lastMonth)).toBe(true);
    expect(isFaltering(11.3, lastMonth)).toBe(false);
  });
});
