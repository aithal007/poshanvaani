// Fallback when the room is too noisy or speech is unavailable. The typed
// values go through exactly the same plausibility checks and read-back.
import { useState } from "react";
import type { Child } from "../lib/db";
import type { Draft } from "../lib/engine";
import type { Lang, Phrases } from "../lib/i18n";

export function Keypad({
  roster, draft, lang, t, onSave, onClose,
}: {
  roster: Child[];
  draft: Draft;
  lang: Lang;
  t: Phrases;
  onSave: (c: Child, w: number, h: number) => void;
  onClose: () => void;
}) {
  const [childId, setChildId] = useState(draft.child?.id ?? draft.options?.[0]?.id ?? "");
  const [w, setW] = useState(draft.weightKg?.toString() ?? "");
  const [h, setH] = useState(draft.heightCm?.toString() ?? "");
  const [field, setField] = useState<"w" | "h">(draft.weightKg === undefined ? "w" : "h");
  const child = roster.find((c) => c.id === childId);
  const valid = child && Number(w) > 0 && Number(h) > 0;

  const press = (k: string) => {
    const set = field === "w" ? setW : setH;
    set((v) => (k === "⌫" ? v.slice(0, -1) : k === "." && v.includes(".") ? v : (v + k).slice(0, 5)));
  };

  return (
    <div className="fixed inset-0 z-20 bg-ink/40 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={t.ui.keypad}>
      <div className="bg-sheet w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold">{t.ui.keypad}</h2>
          <button type="button" onClick={onClose} className="text-slate px-2 py-1">{t.ui.cancel}</button>
        </div>
        <select value={childId} onChange={(e) => setChildId(e.target.value)} className="w-full rounded-xl border-2 border-rule px-3 py-3 text-lg bg-sheet">
          <option value="">—</option>
          {roster.map((c) => (
            <option key={c.id} value={c.id}>{lang === "en" ? c.name : `${c.nameLocal} (${c.name})`}</option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2">
          {(["w", "h"] as const).map((f) => (
            <button key={f} type="button" onClick={() => setField(f)} className={`rounded-2xl px-3 py-2 text-left ${field === f ? "ring-4 ring-turmeric bg-paper" : "bg-paper"}`}>
              <span className="block text-xs text-slate">{f === "w" ? `${t.ui.weight} (${t.ui.kg})` : `${t.ui.height} (${t.ui.cm})`}</span>
              <span className="block text-4xl font-extrabold tabular h-11">{f === "w" ? w : h}</span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"].map((k) => (
            <button key={k} type="button" onClick={() => press(k)} className="rounded-2xl bg-paper text-3xl font-bold py-3 tabular active:bg-rule">{k}</button>
          ))}
        </div>
        <button type="button" disabled={!valid} onClick={() => child && onSave(child, Number(w), Number(h))} className="w-full rounded-2xl bg-ink text-sheet text-xl font-bold py-4 disabled:opacity-40">
          {t.ui.save}
        </button>
      </div>
    </div>
  );
}
