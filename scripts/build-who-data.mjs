// Converts the official WHO Child Growth Standards LMS tables
// (WorldHealthOrganization/anthro, data-raw/growthstandards/*.txt)
// into one compact JSON file used by the app at runtime.
//
// Usage: node scripts/build-who-data.mjs
// Input:  data/who-raw/{weianthro,lenanthro,wflanthro,wfhanthro}.txt
// Output: web/src/data/who-lms.json
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const RAW = join(root, "data", "who-raw");
const OUT = join(root, "web", "src", "data", "who-lms.json");

function readTable(name) {
  const lines = readFileSync(join(RAW, `${name}.txt`), "utf8").trim().split(/\r?\n/);
  const header = lines[0].split("\t");
  return lines.slice(1).map((line) => {
    const cells = line.split("\t");
    const row = {};
    header.forEach((h, i) => (row[h] = cells[i]));
    return row;
  });
}

const round = (n, d) => Number(Number(n).toFixed(d));

// Age-indexed tables: one [L, M, S] triple per day of age, per sex.
function byAge(name) {
  const out = { 1: [], 2: [] };
  for (const r of readTable(name)) {
    const age = Number(r.age);
    out[r.sex][age] = [round(r.l, 4), round(r.m, 4), round(r.s, 5)];
  }
  for (const sex of [1, 2]) {
    if (out[sex].some((v) => v === undefined)) throw new Error(`${name}: gap in sex ${sex}`);
  }
  return out;
}

// Length/height-indexed tables at 0.1 cm steps.
function bySize(name, key) {
  const out = {};
  for (const sex of [1, 2]) {
    const rows = readTable(name).filter((r) => Number(r.sex) === sex);
    const start = Number(rows[0][key]);
    out[sex] = {
      start,
      step: 0.1,
      rows: rows.map((r) => [round(r.l, 4), round(r.m, 4), round(r.s, 5)]),
    };
  }
  return out;
}

const data = {
  source:
    "WHO Child Growth Standards (2006), LMS tables from github.com/WorldHealthOrganization/anthro data-raw/growthstandards",
  wfa: byAge("weianthro"),
  lhfa: byAge("lenanthro"),
  wfl: bySize("wflanthro", "length"),
  wfh: bySize("wfhanthro", "height"),
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(data));
console.log(
  `wrote ${OUT}: wfa ${data.wfa[1].length} days, wfl ${data.wfl[1].rows.length} rows from ${data.wfl[1].start} cm, wfh ${data.wfh[1].rows.length} rows from ${data.wfh[1].start} cm`
);
