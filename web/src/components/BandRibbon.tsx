// Where this child sits on the WHO weight-for-height scale, drawn as the
// same red / yellow / green bands as the growth chart on the MCP card.
const MIN = -4;
const MAX = 3;
const pct = (z: number) => ((Math.min(Math.max(z, MIN), MAX) - MIN) / (MAX - MIN)) * 100;
const TICKS = [-3, -2, 0, 2];

export function BandRibbon({ z, label }: { z: number | null; label: string }) {
  return (
    <div className="mt-6 mb-2" aria-label={`${label}: ${z ?? "not available"}`}>
      <div className="relative">
        <div className="h-3 rounded-full overflow-hidden flex">
          <div className="bg-chilli" style={{ width: `${pct(-3)}%` }} />
          <div className="bg-turmeric" style={{ width: `${pct(-2) - pct(-3)}%` }} />
          <div className="bg-leaf flex-1" />
        </div>
        {z !== null && (
          <div className="band-marker absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${pct(z)}%` }}>
            <div className="w-6 h-6 rounded-full bg-sheet border-[5px] border-ink shadow" />
          </div>
        )}
      </div>
      <div className="relative h-5 mt-1 text-[11px] text-slate tabular">
        {TICKS.map((v) => (
          <span key={v} className="absolute -translate-x-1/2" style={{ left: `${pct(v)}%` }}>
            {v > 0 ? `+${v}` : v}
          </span>
        ))}
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-slate">{label} (WHO)</span>
        {z !== null && <b className="tabular">{z > 0 ? `+${z}` : z}</b>}
      </div>
    </div>
  );
}
