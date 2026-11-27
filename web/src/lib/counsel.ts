// A short, personal message for the child's family, generated right after
// weighing: today's weight, the change since last month, ONE action, and
// the next visit date. Broadcast messages (Kilkari-style) showed weak
// effects on nutrition; this is specific to this child and this reading.
// Deterministic templates: no generated medical advice.
import type { Child, Measurement } from "./db";
import type { Lang } from "./i18n";
import { ageInDays, ageInMonths } from "./who";

/** Next Thursday (the usual anganwadi follow-up day in this demo). */
export function nextVisit(from: Date): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + (((4 - d.getDay() + 7) % 7) || 7));
  return d;
}

const DAYS: Record<Lang, string[]> = {
  mr: ["रविवारी", "सोमवारी", "मंगळवारी", "बुधवारी", "गुरुवारी", "शुक्रवारी", "शनिवारी"],
  hi: ["रविवार", "सोमवार", "मंगलवार", "बुधवार", "गुरुवार", "शुक्रवार", "शनिवार"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};

export function familyMessage(c: Child, m: Measurement, prev: Measurement | undefined, lang: Lang, today = new Date()): string {
  const months = ageInMonths(ageInDays(c.dob, today));
  const name = lang === "en" ? c.name.split(" ")[0] : c.nameLocal.split(" ")[0];
  const parent = c.parentName.split(" ")[0];
  const grams = prev ? Math.round((m.weightKg - prev.weightKg) * 1000) : null;
  const day = DAYS[lang][nextVisit(today).getDay()];
  const young = months < 6;
  const concern = m.status !== "normal" || (grams !== null && grams <= 0);

  if (lang === "mr") {
    const change = grams === null ? "" : grams > 0 ? `मागच्या महिन्यापेक्षा ${grams} ग्रॅम वाढले. ` : grams < 0 ? `मागच्या महिन्यापेक्षा ${-grams} ग्रॅम कमी झाले. ` : "मागच्या महिन्याइतकेच आहे. ";
    const action =
      m.status === "sam" ? `${day} ${name}ला अंगणवाडीत घेऊन या. भूक तपासणी आणि डॉक्टर तपासणी करू.`
      : young ? "बाळाला दिवसातून आठ वेळा फक्त अंगावरचे दूध द्या."
      : concern ? "रोज खिचडीत एक चमचा तेल किंवा तूप घाला आणि एक अंडे किंवा डाळ द्या."
      : "छान वाढ होत आहे. असेच रोज तीन वेळा जेवण आणि दोन वेळा खाऊ द्या.";
    return `नमस्कार ${parent}जी. आज ${name}चे वजन ${m.weightKg} किलो आहे. ${change}${action} पुढची भेट ${day}. - अंगणवाडी ताई`;
  }
  if (lang === "hi") {
    const change = grams === null ? "" : grams > 0 ? `पिछले महीने से ${grams} ग्राम बढ़ा. ` : grams < 0 ? `पिछले महीने से ${-grams} ग्राम कम हुआ. ` : "पिछले महीने जितना ही है. ";
    const action =
      m.status === "sam" ? `${day} को ${name} को आंगनवाड़ी लाइए. भूख जांच और डॉक्टर जांच होगी.`
      : young ? "बच्चे को दिन में आठ बार सिर्फ माँ का दूध पिलाइए."
      : concern ? "रोज़ खिचड़ी में एक चम्मच तेल या घी डालिए और एक अंडा या दाल दीजिए."
      : "अच्छी बढ़त है. ऐसे ही रोज़ तीन बार खाना और दो बार नाश्ता दीजिए.";
    return `नमस्ते ${parent} जी. आज ${name} का वजन ${m.weightKg} किलो है. ${change}${action} अगली मुलाकात ${day}. - आंगनवाड़ी दीदी`;
  }
  const change = grams === null ? "" : grams > 0 ? `That is ${grams} grams more than last month. ` : grams < 0 ? `That is ${-grams} grams less than last month. ` : "That is the same as last month. ";
  const action =
    m.status === "sam" ? `Please bring ${name} to the anganwadi on ${day} for an appetite test and a doctor's check.`
    : young ? "Give only breast milk, eight times a day."
    : concern ? "Add one spoon of oil or ghee to the khichdi every day, and give an egg or dal."
    : "Growing well. Keep giving three meals and two snacks a day.";
  return `Namaste ${parent}ji. Today ${name} weighs ${m.weightKg} kg. ${change}${action} Next visit: ${day}. - Anganwadi didi`;
}
