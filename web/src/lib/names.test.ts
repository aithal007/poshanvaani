import { describe, expect, it } from "vitest";
import { phoneticKey, pickFromOptions, resolveName, toLatin } from "./names";

const roster = [
  { id: "1", name: "Riya Pawar", parentName: "Sunil Pawar" },
  { id: "2", name: "Riya Shinde", parentName: "Mahesh Shinde" },
  { id: "3", name: "Aarav Jadhav", parentName: "Santosh Jadhav" },
  { id: "4", name: "Sai Kale", parentName: "Vikas Kale" },
  { id: "5", name: "Gauri More", parentName: "Anil More" },
];

describe("names", () => {
  it("transliterates Devanagari", () => {
    expect(toLatin("रिया पवार")).toBe("riyaa pavaar");
    expect(toLatin("आरव")).toBe("aarav");
  });

  it("gives the same key across scripts and spellings", () => {
    expect(phoneticKey("रिया पवार")).toBe(phoneticKey("Riya Pawar"));
    expect(phoneticKey("Aarav")).toBe(phoneticKey("Arav"));
    expect(phoneticKey("आरव जाधव")).toBe(phoneticKey("Aarav Jadhav"));
  });

  it("matches a unique first name", () => {
    const r = resolveName("aarav", roster);
    expect(r.kind === "match" && r.child.id).toBe("3");
  });

  it("matches across scripts", () => {
    const r = resolveName("गौरी", roster);
    expect(r.kind === "match" && r.child.id).toBe("5");
  });

  it("reports ambiguity for two Riyas", () => {
    const r = resolveName("riya", roster);
    expect(r.kind).toBe("ambiguous");
  });

  it("uses the surname to disambiguate", () => {
    const r = resolveName("riya pawar", roster);
    expect(r.kind === "match" && r.child.id).toBe("1");
  });

  it("picks from options by surname, parent name or ordinal", () => {
    const options = [roster[0], roster[1]];
    expect(pickFromOptions("Pawar", options)?.id).toBe("1");
    expect(pickFromOptions("Mahesh chi mulgi", options)?.id).toBe("2");
    expect(pickFromOptions("pahili", options)?.id).toBe("1");
    expect(pickFromOptions("शिंदे", options)?.id).toBe("2");
  });

  it("returns none for an unknown name", () => {
    expect(resolveName("Zubair", roster).kind).toBe("none");
  });
});
