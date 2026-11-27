import { describe, expect, it } from "vitest";
import { buildSeed } from "./seed";
import { watchList } from "./watchlist";
import { familyMessage, nextVisit } from "./counsel";

const today = new Date("2026-11-27T10:00:00");
const { children, measurements } = buildSeed(today);

describe("watch list", () => {
  it("puts Soham (flat weight for two months) on the list", () => {
    const list = watchList(children, measurements, 24);
    const soham = list.find((w) => w.child.name === "Soham Chavan");
    expect(soham?.reasons).toContain("flat2");
  });

  it("ranks a SAM child first after Riya Pawar's reading", () => {
    const riya = children.find((c) => c.name === "Riya Pawar")!;
    const extra = { ...measurements[0], id: 999, childId: riya.id, date: "2026-11-27", takenAt: today.getTime(), weightKg: 6.6, heightCm: 74, whz: -3.54, waz: -2.98, haz: -0.89, status: "sam" as const };
    const list = watchList(children, [...measurements, extra]);
    expect(list[0].child.name).toBe("Riya Pawar");
    expect(list[0].reasons).toContain("sam");
  });
});

describe("family message", () => {
  const riya = children.find((c) => c.name === "Riya Pawar")!;
  const prev = { ...measurements[0], weightKg: 7.2 };
  const cur = { ...measurements[0], weightKg: 6.6, status: "sam" as const };

  it("tells the change and one action, in Marathi", () => {
    const msg = familyMessage(riya, cur, prev, "mr", today);
    expect(msg).toContain("600 ग्रॅम कमी");
    expect(msg).toContain("अंगणवाडीत घेऊन या");
  });

  it("works in English and Hindi", () => {
    expect(familyMessage(riya, cur, prev, "en", today)).toContain("600 grams less");
    expect(familyMessage(riya, cur, prev, "hi", today)).toContain("600 ग्राम कम");
  });

  it("schedules the next Thursday", () => {
    expect(nextVisit(today).getDay()).toBe(4);
    expect(nextVisit(today) > today).toBe(true);
  });
});
