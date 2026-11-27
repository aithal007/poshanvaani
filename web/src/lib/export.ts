// Exports for the systems the worker already reports into.
// Poshan Tracker has no public import API, so the export is a CSV laid out
// like its growth-monitoring entry (date, height/length, weight) plus the
// audit columns PoshanVaani adds.
import type { Child, Measurement } from "./db";
import { ageInDays, ageInMonths, DAYS_24_MONTHS } from "./who";
import { CENTRE } from "./seed";

const esc = (v: unknown) => {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const CSV_HEADER = [
  "AWC", "Child name", "Parent name", "Gender", "Date of birth", "Age (months)",
  "Date of measurement", "Weight (kg)", "Height/Length (cm)", "Measured lying", "MUAC (cm)",
  "WAZ", "HAZ", "WHZ", "Nutrition status", "Growth faltering",
  "Entry method", "Corrected before save", "Saved despite warning", "Transcript",
];

export function toCsv(children: Child[], rows: Measurement[]): string {
  const byId = new Map(children.map((c) => [c.id, c]));
  const lines = [CSV_HEADER.join(",")];
  for (const m of rows) {
    const c = byId.get(m.childId);
    if (!c) continue;
    const days = ageInDays(c.dob, new Date(m.date + "T12:00:00"));
    lines.push(
      [
        CENTRE.name, c.name, c.parentName, c.sex === "M" ? "Male" : "Female", c.dob, ageInMonths(days),
        m.date, m.weightKg, m.heightCm, days < DAYS_24_MONTHS ? "Yes" : "No", m.muacCm ?? "",
        m.waz ?? "", m.haz ?? "", m.whz ?? "", m.status.toUpperCase(), m.faltering ? "Yes" : "No",
        m.engine === "manual" ? "Keypad" : `Voice (${m.engine})`, m.corrected ? "Yes" : "No", m.forced ? "Yes" : "No",
        m.transcript,
      ].map(esc).join(",")
    );
  }
  return lines.join("\n");
}

export function downloadCsv(csv: string, filename: string) {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Plain-text referral slip, ready for WhatsApp to the PHC / supervisor. */
export function referralText(c: Child, m: Measurement, prev?: Measurement): string {
  const months = ageInMonths(ageInDays(c.dob, new Date(m.date + "T12:00:00")));
  const change = prev ? ` (${m.weightKg - prev.weightKg >= 0 ? "+" : ""}${Math.round((m.weightKg - prev.weightKg) * 1000)} g since ${prev.date})` : "";
  const label = m.status === "sam" ? "Severe acute malnutrition (SAM)" : m.status === "mam" ? "Moderate acute malnutrition (MAM)" : "Growth faltering";
  const action =
    m.status === "sam"
      ? "Appetite test and medical check by PHC Medical Officer. Refer to NRC if appetite test fails, oedema or complications."
      : "Nutrition counselling, supplementary nutrition and re-weigh in 2 weeks.";
  return [
    `PoshanVaani referral — ${CENTRE.name}, ${CENTRE.place}`,
    `Child: ${c.name} (${c.nameLocal}), ${c.sex === "M" ? "boy" : "girl"}, ${months} months`,
    `Parent: ${c.parentName}`,
    `Weight ${m.weightKg} kg${change}, height ${m.heightCm} cm${m.muacCm ? `, MUAC ${m.muacCm} cm` : ""}`,
    `WHZ ${m.whz ?? "–"} · WAZ ${m.waz ?? "–"} · HAZ ${m.haz ?? "–"}`,
    `Status: ${label}`,
    `Action: ${action}`,
    `Measured ${m.date} by AWW ${CENTRE.worker}. Values confirmed by voice read-back.`,
  ].join("\n");
}

export const whatsappLink = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;
