const ROUND_STEPS = ["R16", "QF", "SF", "F"] as const;

/**
 * Compact placeholder for R16 → champion when Stage 3 knockout picks are not open yet.
 * Replaces a wall of per-match placeholder cards.
 */
export function LockedLaterRoundsPanel() {
  return (
    <div className="flex min-w-[148px] max-w-[200px] shrink-0 flex-col justify-start border-l border-ash-border/35 pl-2 sm:min-w-[168px]">
      <h3 className="mb-2 text-center text-[10px] font-semibold uppercase tracking-wide text-ash-muted sm:text-xs">
        Round of 16 → Champion
      </h3>
      <div className="flex flex-1 flex-col justify-center rounded-lg border border-dashed border-ash-border/45 bg-ash-body/10 px-3 py-4 text-center">
        <p className="text-xs font-medium text-ash-muted">Unlocks in Stage 3</p>
        <p className="mt-1.5 text-[10px] leading-snug text-ash-border-hover">
          Round of 16 through champion unlock once the full official Round of 32 bracket
          is confirmed. Confirmed R32 matchups can be picked gradually before then.
        </p>
        <div
          className="mt-3 flex flex-wrap items-center justify-center gap-1"
          aria-hidden
        >
          {ROUND_STEPS.map((label) => (
            <span
              key={label}
              className="rounded border border-ash-border/40 bg-ash-body/20 px-1.5 py-0.5 text-[9px] font-medium text-ash-muted"
            >
              {label}
            </span>
          ))}
          <span className="text-sm leading-none">🏆</span>
        </div>
      </div>
    </div>
  );
}
