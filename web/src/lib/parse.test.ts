import { describe, expect, it } from "vitest";
import { detectIntent, parseUtterance } from "./parse";

const m = (text: string) => parseUtterance(text).measurement;

describe("parseUtterance: measurements", () => {
  const cases: [string, number | undefined, number | undefined][] = [
    // romanised Hindi / Marathi
    ["Riya Pawar, nau point do kilo, chauhattar centimetre", 9.2, 74],
    ["Riya Pawar nau point do kilo chauryahattar centimetre", 9.2, 74],
    ["Aarav saade nau kilo assi cm", 9.5, 80],
    ["sai paune das kilo bayasi centimetre", 9.75, 82],
    // Devanagari words (what Chrome mr-IN often returns)
    ["रिया पवार नऊ पॉइंट दोन किलो चौऱ्याहत्तर सेंटीमीटर", 9.2, 74],
    ["आरव साडे नऊ किलो ऐंशी सेमी", 9.5, 80],
    ["गौरी साडेतीन किलो पन्नास सेंटीमीटर", 3.5, 50],
    ["रिया नौ पॉइंट दो किलो चौहत्तर सेंटीमीटर", 9.2, 74],
    // digits, as Chrome often normalises numbers
    ["Riya 9.2 kg 74 cm", 9.2, 74],
    ["रिया ९.२ किलो ७४ सेमी", 9.2, 74],
    ["Riya 9.2kg 74cm", 9.2, 74],
    // kilo + gram
    ["Aarav 11 kilo 300 gram, 82 centimetre", 11.3, 82],
    // English words and compounds
    ["Aarav eleven point two kilo eighty two centimetre", 11.2, 82],
    ["Sai nine point two five kilo seventy four", 9.25, 74],
    // field words instead of units, any order
    ["Riya vajan 9.2 lambai 74", 9.2, 74],
    ["Riya height 74 weight 9.2", 9.2, 74],
    // no units at all: decided by range
    ["Riya 9.2 74", 9.2, 74],
    ["Riya 74 9.2", 9.2, 74],
    // heights over 100 cm
    ["Gauri satra kilo ek sau das centimetre", 17, 110],
    ["गौरी सतरा किलो एकशे दहा सेंटीमीटर", 17, 110],
    // dedh / adhai
    ["baby dedh kilo", 1.5, undefined],
  ];
  for (const [text, w, h] of cases) {
    it(text, () => {
      const r = m(text);
      expect(r.weightKg).toBeCloseTo(w ?? NaN, 3);
      if (h === undefined) expect(r.heightCm).toBeUndefined();
      else expect(r.heightCm).toBeCloseTo(h, 3);
    });
  }

  it("reads MUAC", () => {
    expect(m("Riya 9.2 kilo 74 cm muac 11.2").muacCm).toBeCloseTo(11.2, 3);
  });
});

describe("parseUtterance: names", () => {
  it("takes the words before the first number", () => {
    expect(parseUtterance("Riya Pawar, nau point do kilo").nameText).toBe("riya pawar");
    expect(parseUtterance("रिया पवार नऊ पॉइंट दोन किलो").nameText).toBe("रिया पवार");
  });
  it("drops filler words", () => {
    expect(parseUtterance("Riya cha vajan 9.2 kilo").nameText).toBe("riya");
  });
});

describe("detectIntent", () => {
  const cases: [string, string][] = [
    ["ho", "yes"], ["होय", "yes"], ["haan", "yes"], ["barobar", "yes"], ["सही है", "yes"],
    ["nahi", "no"], ["नाही", "no"], ["barobar nahi", "no"], ["galat", "no"],
    ["nahi, 9.4 kilo", "no"],
    ["vajan shuru", "start"], ["वजन सुरू करा", "start"],
    ["kon baaki aahe", "pending"], ["कोण बाकी आहे?", "pending"], ["kaun baaki hai", "pending"],
    ["maagcha radd kara", "undo"], ["pichhla wapas lo", "undo"],
    ["session band kara", "stop"], ["सत्र बंद करा", "stop"],
    ["Riya 9.2 kilo", "other"],
  ];
  for (const [text, intent] of cases) it(`${text} -> ${intent}`, () => expect(detectIntent(text)).toBe(intent));
});
