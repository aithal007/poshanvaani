import type { MicState } from "../hooks/useWeighing";

export function MicButton({ state, onClick, label }: { state: MicState; onClick: () => void; label: string }) {
  const listening = state === "listening";
  const busy = state === "thinking" || state === "speaking";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={state !== "off"}
      className={`relative grid place-items-center w-24 h-24 rounded-full text-sheet shadow-lg transition-colors ${
        listening ? "bg-chilli" : busy ? "bg-ink-soft" : "bg-ink"
      }`}
    >
      {listening && (
        <>
          <span className="mic-ring absolute inset-0 rounded-full bg-chilli" />
          <span className="mic-ring delay absolute inset-0 rounded-full bg-chilli" />
        </>
      )}
      {state === "speaking" ? (
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="relative">
          <path d="M11 5 6 9H3v6h3l5 4V5z" />
          <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
        </svg>
      ) : state === "listening" || state === "thinking" ? (
        <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor" className="relative">
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      ) : (
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="relative">
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
      )}
    </button>
  );
}
