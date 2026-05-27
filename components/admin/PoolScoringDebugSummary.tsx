import type { PoolScoringDebugSummary } from "@/lib/admin/fetchPoolScoringDebugSummary";
import { formatPoolPoints } from "@/lib/format/poolPoints";

type Props = {
  summary: PoolScoringDebugSummary;
  errorMessage?: string | null;
};

function formatGroupAdvance(
  exact: number | null | undefined,
  wrong: number | null | undefined,
): string {
  if (exact == null || wrong == null) return "Missing";
  return `${formatPoolPoints(exact)} / ${formatPoolPoints(wrong)}`;
}

export function PoolScoringDebugSummary({ summary, errorMessage }: Props) {
  const { resolved } = summary;
  const knockoutRows = Object.entries(resolved.knockoutPointsByKind).sort(
    ([a], [b]) => a.localeCompare(b),
  );
  const bonusRows = Object.entries(resolved.bonusPointsByKey).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <section className="ash-surface mb-8 space-y-4 border border-sky-700/35 bg-sky-950/10 p-4">
      <div>
        <h2 className="text-base font-bold text-ash-text">Scoring config debug</h2>
        <p className="text-sm text-ash-muted">
          Values below are what{" "}
          <code className="text-xs">computePoolScores</code> and the public rules page
          should both use for this pool.
        </p>
      </div>

      {errorMessage ? (
        <p className="rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {errorMessage}
        </p>
      ) : null}

      <div className="grid gap-3 text-sm text-ash-muted md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-md border border-ash-border/70 bg-ash-body/20 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide">Stage 1 (group)</div>
          <div className="mt-1 font-medium text-ash-text">
            {formatGroupAdvance(
              resolved.groupAdvance?.exactPoints,
              resolved.groupAdvance?.wrongSlotPoints,
            )}
          </div>
          <div className="mt-1 text-xs">Source: {summary.sources.groupAdvance}</div>
        </div>
        <div className="rounded-md border border-ash-border/70 bg-ash-body/20 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide">Stage 2 (third place)</div>
          <div className="mt-1 font-medium text-ash-text">
            {resolved.thirdPlaceQualifierPoints != null
              ? formatPoolPoints(resolved.thirdPlaceQualifierPoints)
              : "Missing"}
          </div>
          <div className="mt-1 text-xs">Source: {summary.sources.thirdPlace}</div>
        </div>
        <div className="rounded-md border border-ash-border/70 bg-ash-body/20 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide">Scoring rules</div>
          <div className="mt-1 font-medium text-ash-text">{summary.scoringRuleCount}</div>
        </div>
        <div className="rounded-md border border-ash-border/70 bg-ash-body/20 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide">Ledger rows</div>
          <div className="mt-1 font-medium text-ash-text">
            {summary.pointsLedgerRowCount}
          </div>
        </div>
      </div>

      {knockoutRows.length > 0 ? (
        <div className="text-sm text-ash-muted">
          <p className="font-medium text-ash-text">Knockout (once per team)</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            {knockoutRows.map(([kind, points]) => (
              <li key={kind}>
                {kind}: {formatPoolPoints(points)} pts ({summary.sources.knockout})
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {bonusRows.length > 0 ? (
        <div className="text-sm text-ash-muted">
          <p className="font-medium text-ash-text">Bonus</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            {bonusRows.map(([key, points]) => (
              <li key={key}>
                {key}: {formatPoolPoints(points)} pts ({summary.sources.bonus})
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {summary.distinctLedgerDeltas.length > 0 ? (
        <div className="text-sm text-ash-muted">
          <p className="font-medium text-ash-text">Distinct ledger increments</p>
          <p className="mt-1">
            {summary.distinctLedgerDeltas
              .map((delta) => `+${formatPoolPoints(delta)}`)
              .join(", ")}
          </p>
          <p className="mt-1 text-xs">
            If these do not match Stage 1–2 values above, re-run standings recalculate
            after fixing scoring config.
          </p>
        </div>
      ) : null}
    </section>
  );
}
