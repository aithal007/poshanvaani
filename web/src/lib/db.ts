// Offline-first storage in IndexedDB (Dexie). Every saved reading keeps
// the raw transcript, the parsed values, whether it was corrected, and an
// optional short audio clip, so a supervisor can see exactly what was
// said. Nothing is overwritten: an undo marks the entry as voided.
import Dexie, { type EntityTable } from "dexie";
import type { Sex, Status } from "./who";

export interface Child {
  id: string;
  name: string; // "Riya Pawar"
  nameLocal: string; // "रिया पवार"
  parentName: string;
  sex: Sex;
  dob: string; // ISO date
}

export interface Measurement {
  id?: number;
  childId: string;
  date: string; // ISO date of measurement
  takenAt: number; // epoch ms
  weightKg: number;
  heightCm: number;
  muacCm?: number;
  oedema?: boolean;
  waz: number | null;
  haz: number | null;
  whz: number | null;
  status: Status;
  faltering: boolean;
  transcript: string; // exactly what speech-to-text returned
  corrected: boolean; // a plausibility prompt or "nahi" changed the value
  forced: boolean; // saved despite a plausibility warning
  engine: string; // which speech engine heard it
  audio?: Blob; // short clip of the spoken reading
  durationMs?: number; // from first word about this child to saved
  synced: boolean;
  voided: boolean;
}

export interface Referral {
  id?: number;
  childId: string;
  measurementId: number;
  createdAt: number;
  status: Status;
  reason: string;
  shared: boolean;
}

export const db = new Dexie("poshanvaani") as Dexie & {
  children: EntityTable<Child, "id">;
  measurements: EntityTable<Measurement, "id">;
  referrals: EntityTable<Referral, "id">;
};

db.version(1).stores({
  children: "id, name",
  measurements: "++id, childId, date, synced, voided, [childId+date]",
  referrals: "++id, childId, measurementId, createdAt",
});

/** Latest non-voided measurement for a child, optionally before a date. */
export async function lastMeasurement(childId: string, beforeDate?: string) {
  const all = await db.measurements.where("childId").equals(childId).toArray();
  return all
    .filter((m) => !m.voided && (!beforeDate || m.date < beforeDate))
    .sort((a, b) => b.takenAt - a.takenAt)[0];
}

export async function historyFor(childId: string) {
  const all = await db.measurements.where("childId").equals(childId).toArray();
  return all.filter((m) => !m.voided).sort((a, b) => a.takenAt - b.takenAt);
}

export const todayIso = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
