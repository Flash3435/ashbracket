import type { GeneratedSimulationScore } from "@/lib/admin/simulationGeneratedScores";

type Props = {
  rows: GeneratedSimulationScore[];
  errorMessage?: string | null;
};

function formatKickoff(iso: string | null): string {
  if (!iso) return "No kickoff time";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function scoreLabel(row: GeneratedSimulationScore): string {
  const base = `${row.homeGoals}-${row.awayGoals}`;
  if (row.homePenalties == null || row.awayPenalties == null) return base;
  return `${base} (pens ${row.homePenalties}-${row.awayPenalties})`;
}

export function GeneratedSimulationScoresSection({
  rows,
  errorMessage = null,
}: Props) {
  return (
    <section className="ash-surface mb-8 space-y-4 border border-amber-700/30 bg-amber-950/10 p-4">
      <div className="space-y-2">
        <h2 className="text-base font-bold text-ash-text">
          Generated simulation scores
        </h2>
        <p className="text-sm leading-relaxed text-ash-muted">
          Persisted fake scores already applied to this simulation edition. This
          reads saved `tournament_matches` score rows, which are the source of truth
          used to rebuild derived results and recompute simulation standings.
        </p>
      </div>

      {errorMessage ? (
        <p className="rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {errorMessage}
        </p>
      ) : null}

      {!errorMessage && rows.length === 0 ? (
        <p className="rounded-md border border-ash-border bg-ash-body/30 px-3 py-3 text-sm text-ash-muted">
          No simulated scores have been applied yet for this edition. Use the
          preview/apply flow above to generate the next batch.
        </p>
      ) : null}

      {!errorMessage && rows.length > 0 ? (
        <div className="max-h-[420px] overflow-auto rounded-md border border-ash-border/60 bg-ash-body/20">
          <table className="w-full min-w-[860px] border-collapse text-left text-xs">
            <thead className="sticky top-0 bg-ash-body/95 text-[10px] font-semibold uppercase tracking-wide text-ash-muted">
              <tr>
                <th className="border-b border-ash-border/60 px-2 py-2">Kickoff</th>
                <th className="border-b border-ash-border/60 px-2 py-2">Match</th>
                <th className="border-b border-ash-border/60 px-2 py-2">Stage</th>
                <th className="border-b border-ash-border/60 px-2 py-2">Home</th>
                <th className="border-b border-ash-border/60 px-2 py-2">Away</th>
                <th className="border-b border-ash-border/60 px-2 py-2">Score</th>
                <th className="border-b border-ash-border/60 px-2 py-2">Outcome</th>
                <th className="border-b border-ash-border/60 px-2 py-2">Applied</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.matchId} className="border-b border-ash-border/40">
                  <td className="whitespace-nowrap px-2 py-2">
                    {formatKickoff(row.kickoffAt)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 font-mono text-ash-text">
                    {row.matchCode}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-ash-text">
                    {row.stageLabel}
                    {row.groupCode ? ` · Group ${row.groupCode}` : ""}
                  </td>
                  <td className="px-2 py-2 text-ash-text">{row.homeTeamName}</td>
                  <td className="px-2 py-2 text-ash-text">{row.awayTeamName}</td>
                  <td className="whitespace-nowrap px-2 py-2 font-medium text-ash-text">
                    {scoreLabel(row)}
                  </td>
                  <td className="px-2 py-2">{row.outcomeLabel}</td>
                  <td className="whitespace-nowrap px-2 py-2">
                    <span className="rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100">
                      Applied
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
