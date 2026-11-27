// Weight-for-age growth chart with WHO bands, like the chart printed in
// the Mother and Child Protection card. The newest point drops in.
import type { Child, Measurement } from "../lib/db";
import { ageInDays, valueAtZ } from "../lib/who";

const W = 340;
const H = 210;
const PAD = { l: 34, r: 10, t: 10, b: 26 };

export function GrowthChart({ child, history }: { child: Child; history: Measurement[] }) {
  if (!history.length) return null;
  const pts = history.map((m) => ({
    months: ageInDays(child.dob, new Date(m.date + "T12:00:00")) / 30.4375,
    kg: m.weightKg,
    m,
  }));
  const x0 = Math.max(0, Math.floor(pts[0].months) - 2);
  const x1 = Math.min(60, Math.ceil(pts[pts.length - 1].months) + 2);
  const curve = (z: number) => {
    const out: [number, number][] = [];
    for (let mo = x0; mo <= x1 + 1e-9; mo += 0.5) out.push([mo, valueAtZ("wfa", child.sex, mo * 30.4375, z)]);
    return out;
  };
  const m3 = curve(-3);
  const m2 = curve(-2);
  const p2 = curve(2);
  const y0 = Math.floor(Math.min(...m3.map((p) => p[1]), ...pts.map((p) => p.kg)) - 0.5);
  const y1 = Math.ceil(Math.max(...p2.map((p) => p[1]), ...pts.map((p) => p.kg)) + 0.3);

  const sx = (mo: number) => PAD.l + ((mo - x0) / (x1 - x0)) * (W - PAD.l - PAD.r);
  const sy = (kg: number) => H - PAD.b - ((kg - y0) / (y1 - y0)) * (H - PAD.t - PAD.b);
  const path = (c: [number, number][]) => c.map(([m, k], i) => `${i ? "L" : "M"}${sx(m).toFixed(1)},${sy(k).toFixed(1)}`).join("");
  const area = (top: [number, number][], bottom: [number, number][]) =>
    `${path(top)}L${[...bottom].reverse().map(([m, k]) => `${sx(m).toFixed(1)},${sy(k).toFixed(1)}`).join("L")}Z`;
  const floor: [number, number][] = m3.map(([m]) => [m, y0]);
  const ceil: [number, number][] = m3.map(([m]) => [m, y1]);

  const colour = (s: string) => (s === "sam" ? "var(--color-chilli)" : s === "mam" ? "var(--color-turmeric)" : "var(--color-ink)");
  const yTicks = Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i).filter((v) => (y1 - y0 > 8 ? v % 2 === 0 : true));
  const xTicks = Array.from({ length: x1 - x0 + 1 }, (_, i) => x0 + i).filter((v) => v % (x1 - x0 > 10 ? 3 : 1) === 0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Weight-for-age growth chart">
      <path d={area(m3, floor)} fill="var(--color-chilli-wash)" />
      <path d={area(m2, m3)} fill="var(--color-turmeric-wash)" />
      <path d={area(ceil, m2)} fill="var(--color-leaf-wash)" />
      <path d={path(m3)} fill="none" stroke="var(--color-chilli)" strokeWidth="1" />
      <path d={path(m2)} fill="none" stroke="var(--color-turmeric)" strokeWidth="1" />
      {yTicks.map((v) => (
        <text key={v} x={PAD.l - 6} y={sy(v) + 3} textAnchor="end" fontSize="9" fill="var(--color-slate)">
          {v}
        </text>
      ))}
      {xTicks.map((v) => (
        <text key={v} x={sx(v)} y={H - 8} textAnchor="middle" fontSize="9" fill="var(--color-slate)">
          {v}
        </text>
      ))}
      <text x={W - PAD.r} y={PAD.t + 8} textAnchor="end" fontSize="9" fill="var(--color-slate)">age (months)</text>
      <text x={4} y={PAD.t + 4} fontSize="9" fill="var(--color-slate)">kg</text>
      <path d={pts.map((p, i) => `${i ? "L" : "M"}${sx(p.months)},${sy(p.kg)}`).join("")} fill="none" stroke="var(--color-ink-soft)" strokeWidth="1.5" strokeDasharray="3 3" />
      {pts.map((p, i) => {
        const last = i === pts.length - 1;
        return (
          <g key={p.m.id ?? i} className={last ? "drop-in" : undefined}>
            <circle cx={sx(p.months)} cy={sy(p.kg)} r={last ? 6 : 3.5} fill={colour(p.m.status)} stroke="#fff" strokeWidth="1.5" />
            {last && (
              <text x={sx(p.months) - 8} y={sy(p.kg) - 10} textAnchor="end" fontSize="11" fontWeight="700" fill={colour(p.m.status)}>
                {p.kg} kg
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
