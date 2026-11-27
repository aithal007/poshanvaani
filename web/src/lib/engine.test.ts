import { beforeEach, describe, expect, it } from "vitest";
import { Engine } from "./engine";
import { PHRASES } from "./i18n";
import { buildSeed } from "./seed";
import { ageInDays, ageInMonths } from "./who";

const today = new Date("2026-11-27T10:00:00");
const { children, measurements } = buildSeed(today);
const previous = (id: string) =>
  measurements
    .filter((m) => m.childId === id && m.date < "2026-11-27")
    .sort((a, b) => b.takenAt - a.takenAt)[0];

let engine: Engine;
beforeEach(() => {
  engine = new Engine({
    roster: children,
    previous,
    ageMonths: (c) => ageInMonths(ageInDays(c.dob, today)),
    phrases: PHRASES.en,
    lang: "en",
    today,
  });
});

describe("voice flow", () => {
  it("happy path: name + numbers -> read-back -> yes saves", () => {
    let t = engine.handle("Gauri More, saat point teen kilo, 68 centimetre");
    expect(t.phase).toBe("confirm");
    expect(t.say).toContain("Gauri More");
    expect(t.draft.weightKg).toBe(7.3);
    t = engine.handle("ho");
    expect(t.effect?.type).toBe("save");
    expect(engine.phase).toBe("listen");
  });

  it("asks which Riya, accepts the surname, then reads back", () => {
    let t = engine.handle("Riya, saha point saha kilo, chauhattar centimetre");
    expect(t.phase).toBe("disambiguate");
    expect(t.say).toContain("Riya Pawar");
    expect(t.say).toContain("Riya Shinde");
    t = engine.handle("Pawar");
    expect(t.phase).toBe("confirm");
    expect(t.draft.child?.name).toBe("Riya Pawar");
    expect(t.draft.weightKg).toBe(6.6);
    expect(t.draft.heightCm).toBe(74);
  });

  it("catches a digit swap and applies the suggestion on yes", () => {
    let t = engine.handle("Aarav, 10.8 kilo, 28 centimetre");
    expect(t.phase).toBe("plausibility");
    expect(t.say).toContain("82");
    t = engine.handle("haan");
    expect(t.phase).toBe("confirm");
    expect(t.draft.heightCm).toBe(82);
    expect(t.draft.corrected).toBe(true);
  });

  it("accepts a re-measured number in the plausibility step", () => {
    engine.handle("Aarav, 10.8 kilo, 28 centimetre");
    const t = engine.handle("nahi, 81.5");
    expect(t.phase).toBe("confirm");
    expect(t.draft.heightCm).toBe(81.5);
  });

  it("corrects one field from the read-back", () => {
    engine.handle("Gauri More, saat point teen kilo, 68 centimetre");
    const t = engine.handle("nahi, 7.4 kilo");
    expect(t.phase).toBe("confirm");
    expect(t.draft.weightKg).toBe(7.4);
    expect(t.draft.heightCm).toBe(68);
  });

  it("discards on a plain no", () => {
    engine.handle("Gauri More, saat point teen kilo, 68 centimetre");
    const t = engine.handle("nahi");
    expect(t.phase).toBe("listen");
    expect(t.draft.child).toBeUndefined();
  });

  it("asks for a missing height and accepts a bare number", () => {
    let t = engine.handle("Gauri More saat point teen kilo");
    expect(t.phase).toBe("needField");
    t = engine.handle("68");
    expect(t.phase).toBe("confirm");
    expect(t.draft.heightCm).toBe(68);
  });

  it("offers the keypad after repeated noise", () => {
    engine.handle("");
    engine.handle("");
    const t = engine.handle("");
    expect(t.effect?.type).toBe("keypad");
  });

  it("uses recogniser alternatives to find the child", () => {
    const t = engine.handle("Gary more 7.3 kilo 68 cm", ["Gauri More 7.3 kilo 68 cm"]);
    expect(t.draft.child?.name).toBe("Gauri More");
  });

  it("handles commands in any phase", () => {
    engine.handle("Gauri More, saat point teen kilo, 68 centimetre");
    expect(engine.handle("kon baaki aahe").effect?.type).toBe("pending");
    expect(engine.handle("session band kara").effect?.type).toBe("end");
  });

  it("works in Marathi script", () => {
    engine.deps.phrases = PHRASES.mr;
    engine.deps.lang = "mr";
    let t = engine.handle("गौरी मोरे सात पॉइंट तीन किलो अडुसष्ट सेंटीमीटर");
    expect(t.phase).toBe("confirm");
    expect(t.say).toContain("गौरी मोरे");
    t = engine.handle("होय");
    expect(t.effect?.type).toBe("save");
  });

  it("force-saves an unusual value after two confirmations", () => {
    let t = engine.handle("Aarav, 10.8 kilo, 79.4 centimetre"); // shrank > 1 cm, no suggestion
    expect(t.phase).toBe("plausibility");
    t = engine.handle("ho");
    expect(t.phase).toBe("force");
    t = engine.handle("ho");
    expect(t.phase).toBe("confirm");
    expect(t.draft.forced).toBe(true);
  });
});
