// Demo roster for one anganwadi centre: 24 children aged 2–60 months with
// three months of past readings. Values are generated from the WHO growth
// standards so the z-scores look like a real village centre. Dates are
// relative to today so the demo always works.
//
// Built-in demo stories:
//  - Two children named Riya (voice disambiguation)
//  - Riya Pawar (14 months) has been losing weight: today she is SAM
//  - Aarav Jadhav (20 months) was 81 cm last month: "28 cm" is a digit swap
//  - Six children were already weighed today, so "who is left?" has an answer
import { db, todayIso, type Child, type Measurement } from "./db";
import { classify, valueAtZ, zScores, type Sex } from "./who";

interface Spec {
  name: string;
  nameLocal: string;
  parent: string;
  sex: Sex;
  months: number;
  wz: number; // weight-for-age z-score
  hz: number; // height-for-age z-score
  weights?: number[]; // explicit past weights (oldest first), overrides wz
  weighedToday?: boolean;
}

const SPECS: Spec[] = [
  { name: "Riya Pawar", nameLocal: "रिया पवार", parent: "Sunil Pawar", sex: "F", months: 14, wz: -2.6, hz: -1.3, weights: [7.6, 7.4, 7.2] },
  { name: "Riya Shinde", nameLocal: "रिया शिंदे", parent: "Mahesh Shinde", sex: "F", months: 40, wz: -0.4, hz: -0.6 },
  { name: "Aarav Jadhav", nameLocal: "आरव जाधव", parent: "Santosh Jadhav", sex: "M", months: 20, wz: -0.5, hz: -1.0 },
  { name: "Gauri More", nameLocal: "गौरी मोरे", parent: "Anil More", sex: "F", months: 9, wz: -1.1, hz: -0.8 },
  { name: "Sai Kale", nameLocal: "साई काळे", parent: "Vikas Kale", sex: "M", months: 33, wz: -2.3, hz: -2.4 },
  { name: "Om Patil", nameLocal: "ओम पाटील", parent: "Ganesh Patil", sex: "M", months: 52, wz: -0.2, hz: -0.4, weighedToday: true },
  { name: "Shravani Deshmukh", nameLocal: "श्रावणी देशमुख", parent: "Ajay Deshmukh", sex: "F", months: 27, wz: -0.9, hz: -1.2, weighedToday: true },
  { name: "Vedant Gaikwad", nameLocal: "वेदांत गायकवाड", parent: "Sachin Gaikwad", sex: "M", months: 6, wz: 0.2, hz: 0.1 },
  { name: "Ananya Kulkarni", nameLocal: "अनन्या कुलकर्णी", parent: "Prasad Kulkarni", sex: "F", months: 45, wz: 0.1, hz: 0.3, weighedToday: true },
  { name: "Soham Chavan", nameLocal: "सोहम चव्हाण", parent: "Rahul Chavan", sex: "M", months: 18, wz: -1.6, hz: -1.9, weights: [9.6, 9.6, 9.5] },
  { name: "Tanvi Bhosale", nameLocal: "तन्वी भोसले", parent: "Nitin Bhosale", sex: "F", months: 36, wz: -1.0, hz: -1.4 },
  { name: "Arjun Salunkhe", nameLocal: "अर्जुन साळुंखे", parent: "Dattatray Salunkhe", sex: "M", months: 58, wz: -0.7, hz: -0.9, weighedToday: true },
  { name: "Pari Waghmare", nameLocal: "परी वाघमारे", parent: "Sandip Waghmare", sex: "F", months: 4, wz: -0.3, hz: -0.2 },
  { name: "Krishna Thakare", nameLocal: "कृष्णा ठाकरे", parent: "Balu Thakare", sex: "M", months: 24, wz: -1.3, hz: -1.6 },
  { name: "Swara Mane", nameLocal: "स्वरा माने", parent: "Vijay Mane", sex: "F", months: 12, wz: -0.6, hz: -0.5, weighedToday: true },
  { name: "Yash Shelke", nameLocal: "यश शेळके", parent: "Pandurang Shelke", sex: "M", months: 42, wz: -1.9, hz: -2.2 },
  { name: "Anvi Lokhande", nameLocal: "अन्वी लोखंडे", parent: "Kiran Lokhande", sex: "F", months: 30, wz: -0.8, hz: -0.7 },
  { name: "Rudra Kamble", nameLocal: "रुद्र कांबळे", parent: "Prakash Kamble", sex: "M", months: 8, wz: -1.2, hz: -0.9 },
  { name: "Ira Sonawane", nameLocal: "इरा सोनवणे", parent: "Mangesh Sonawane", sex: "F", months: 55, wz: -0.4, hz: -0.8, weighedToday: true },
  { name: "Shivansh Nikam", nameLocal: "शिवांश निकम", parent: "Amol Nikam", sex: "M", months: 3, wz: 0.0, hz: 0.2 },
  { name: "Mrunal Kadam", nameLocal: "मृणाल कदम", parent: "Sunil Kadam", sex: "F", months: 22, wz: -1.5, hz: -1.1 },
  { name: "Atharva Joshi", nameLocal: "अथर्व जोशी", parent: "Mukund Joshi", sex: "M", months: 48, wz: 0.3, hz: 0.1 },
  { name: "Durva Ghule", nameLocal: "दुर्वा घुले", parent: "Ramesh Ghule", sex: "F", months: 16, wz: -0.9, hz: -1.0 },
  { name: "Kabir Shaikh", nameLocal: "कबीर शेख", parent: "Salim Shaikh", sex: "M", months: 38, wz: -1.1, hz: -1.3 },
];

const DAY = 86400000;
const round1 = (n: number) => Math.round(n * 10) / 10;

export const CENTRE = { name: "Anganwadi Centre 12", nameLocal: "अंगणवाडी केंद्र १२", place: "Nashik", worker: "Sunita" };

export function buildSeed(today = new Date()) {
  const children: Child[] = [];
  const measurements: Measurement[] = [];
  SPECS.forEach((s, i) => {
    const id = `c${String(i + 1).padStart(2, "0")}`;
    const dobDate = new Date(today.getTime() - (s.months * 30.4375 + 2) * DAY);
    const dob = todayIso(dobDate);
    children.push({ id, name: s.name, nameLocal: s.nameLocal, parentName: s.parent, sex: s.sex, dob });

    const visits = s.weighedToday ? [3, 2, 1, 0] : [3, 2, 1];
    let prevHeight: number | undefined;
    visits.forEach((back, k) => {
      const at = new Date(today.getTime() - back * 30 * DAY + (back ? 0 : -2 * 3600 * 1000));
      const ageDays = Math.round((at.getTime() - dobDate.getTime()) / DAY);
      let weightKg = round1(
        s.weights?.[k] ?? valueAtZ("wfa", s.sex, ageDays, s.wz + ((i * 7 + k) % 5) * 0.03)
      );
      let heightCm = round1(valueAtZ("lhfa", s.sex, ageDays, s.hz));
      // Past months were written on paper and typed in later: like real
      // registers, they heap on .0/.5 and some heights are copied forward.
      // Today's readings were captured live by voice at full precision.
      if (back > 0) {
        if (!s.weights && i % 3 !== 0) weightKg = Math.round(weightKg * 2) / 2;
        if (i % 4 === 1 && prevHeight !== undefined) heightCm = prevHeight;
        else if (i % 3 !== 2) heightCm = Math.round(heightCm * 2) / 2;
      }
      prevHeight = heightCm;
      const z = zScores(s.sex, ageDays, weightKg, heightCm);
      const c = classify(z);
      measurements.push({
        childId: id,
        date: todayIso(at),
        takenAt: at.getTime(),
        weightKg,
        heightCm,
        waz: z.waz,
        haz: z.haz,
        whz: z.whz,
        status: c.status,
        faltering: false,
        transcript: back ? "(paper register, typed later)" : `${s.name} ${weightKg} kilo ${heightCm} centimetre`,
        corrected: false,
        forced: false,
        engine: back ? "manual" : "webspeech",
        synced: back > 0,
        voided: false,
      });
    });
  });
  return { children, measurements };
}

export async function seedIfEmpty(force = false) {
  const count = await db.children.count();
  if (count > 0 && !force) return;
  const { children, measurements } = buildSeed();
  await db.transaction("rw", db.children, db.measurements, db.referrals, async () => {
    await db.children.clear();
    await db.measurements.clear();
    await db.referrals.clear();
    await db.children.bulkAdd(children);
    await db.measurements.bulkAdd(measurements);
  });
}
