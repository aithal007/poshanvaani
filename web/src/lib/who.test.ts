import { describe, expect, it } from "vitest";
import { classify, lmsZ, restrictedZ, weightForAgeBands, zScores } from "./who";

describe("WHO LMS z-scores", () => {
  it("is 0 at the median and ±2 at the SD lines", () => {
    const p: [number, number, number] = [0.3487, 3.3464, 0.14602]; // boys, birth, WFA
    expect(lmsZ(3.3464, p)).toBeCloseTo(0, 6);
    const b = weightForAgeBands("M", 0);
    expect(lmsZ(b.m2, p)).toBeCloseTo(-2, 6);
    expect(lmsZ(b.p2, p)).toBeCloseTo(2, 6);
  });

  it("matches published WHO weight-for-age chart values (boys 12 months)", () => {
    // WHO WFA boys chart, 12 months: -3SD 6.9, -2SD 7.7, median 9.6 kg
    const b = weightForAgeBands("M", 365);
    expect(b.m3).toBeCloseTo(6.9, 1);
    expect(b.m2).toBeCloseTo(7.7, 1);
    expect(b.median).toBeCloseTo(9.6, 1);
  });

  it("matches published WHO weight-for-age chart values (girls 24 months)", () => {
    // WHO WFA girls chart, 24 months: -2SD 9.0, median 11.5 kg
    const b = weightForAgeBands("F", 731);
    expect(b.m2).toBeCloseTo(9.0, 1);
    expect(b.median).toBeCloseTo(11.5, 1);
  });

  it("applies the restricted adjustment beyond -3 SD and stays continuous", () => {
    const p: [number, number, number] = [-0.3521, 7.4327, 0.08217];
    const sd = (k: number) => p[1] * Math.pow(1 + p[0] * p[2] * k, 1 / p[0]);
    expect(restrictedZ(sd(-3), p)).toBeCloseTo(-3, 6);
    expect(restrictedZ(sd(-3) - (sd(-2) - sd(-3)), p)).toBeCloseTo(-4, 6);
  });

  it("uses weight-for-length under 2 years and weight-for-height after", () => {
    const young = zScores("F", 300, 8.0, 70);
    const old = zScores("F", 900, 11.0, 85);
    expect(young.whz).not.toBeNull();
    expect(old.whz).not.toBeNull();
  });

  it("classifies a thin child as SAM", () => {
    // Girl, 14 months, 74 cm, 6.6 kg: very low weight for length
    const z = zScores("F", 426, 6.6, 74);
    expect(z.whz!).toBeLessThan(-3);
    expect(classify(z).status).toBe("sam");
  });

  it("classifies by MUAC when weight-for-height is normal", () => {
    const z = { waz: -1, haz: -1, whz: -1 };
    expect(classify(z, 11.2, 400).status).toBe("sam");
    expect(classify(z, 12.0, 400).status).toBe("mam");
    expect(classify(z, 13.0, 400).status).toBe("normal");
  });

  it("flags biologically implausible z-scores", () => {
    const z = zScores("M", 365, 9.6, 28); // 28 cm at 1 year: impossible
    expect(classify(z).flags).toContain("haz");
  });
});
