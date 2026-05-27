import type { SimulationEditionDebugSummary } from "@/lib/admin/fetchSimulationEditionDebugSummary";

type Props = {
  summary: SimulationEditionDebugSummary;
  errorMessage?: string | null;
};

function groupAdvanceLabel(exact: number | null, wrong: number | null): string {
  if (exact == null || wrong == null) return "Missing";
  return `${exact}/${wrong}`;
}

export function SimulationEditionDebugSummary({ summary, errorMessage }: Props) {
  return (
    <section className="ash-surface mb-8 space-y-4 border border-amber-700/40 bg-amber-950/10 p-4">
      <div>
        <h2 className="text-base font-bold text-ash-text">Simulation scoring debug</h2>
        <p className="text-sm text-ash-muted">
          Lightweight counts for the result rows and ledger inputs that simulation pools depend
          on.
        </p>
      </div>

      {errorMessage ? (
        <p className="rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {errorMessage}
        </p>
      ) : null}

      <div className="grid gap-3 text-sm text-ash-muted md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-md border border-ash-border/70 bg-ash-body/20 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide">Groups resolved</div>
          <div className="mt-1 font-medium text-ash-text">{summary.groupsResolvedCount}</div>
        </div>
        <div className="rounded-md border border-ash-border/70 bg-ash-body/20 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide">Third-place advancers</div>
          <div className="mt-1 font-medium text-ash-text">
            {summary.thirdPlaceAdvancersCount}
          </div>
        </div>
        <div className="rounded-md border border-ash-border/70 bg-ash-body/20 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide">Round of 32 rows</div>
          <div className="mt-1 font-medium text-ash-text">{summary.roundOf32RowsCount}</div>
        </div>
        <div className="rounded-md border border-ash-border/70 bg-ash-body/20 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide">Knockout result rows</div>
          <div className="mt-1 font-medium text-ash-text">{summary.knockoutResultRowsCount}</div>
        </div>
        <div className="rounded-md border border-ash-border/70 bg-ash-body/20 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide">Bonus result rows</div>
          <div className="mt-1 font-medium text-ash-text">{summary.bonusResultRowsCount}</div>
        </div>
        <div className="rounded-md border border-ash-border/70 bg-ash-body/20 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide">Attached simulation pools</div>
          <div className="mt-1 font-medium text-ash-text">{summary.poolDebugRows.length}</div>
        </div>
      </div>

      <div className="overflow-auto rounded-md border border-ash-border/60 bg-ash-body/20">
        <table className="w-full min-w-[720px] border-collapse text-left text-xs">
          <thead className="bg-ash-body/80 text-[10px] font-semibold uppercase tracking-wide text-ash-muted">
            <tr>
              <th className="border-b border-ash-border/60 px-2 py-2">Pool</th>
              <th className="border-b border-ash-border/60 px-2 py-2">Group scoring</th>
              <th className="border-b border-ash-border/60 px-2 py-2">Scoring rules</th>
              <th className="border-b border-ash-border/60 px-2 py-2">Ledger rows</th>
            </tr>
          </thead>
          <tbody>
            {summary.poolDebugRows.length === 0 ? (
              <tr>
                <td className="px-2 py-3 text-ash-muted" colSpan={4}>
                  No simulation pools are attached to this edition.
                </td>
              </tr>
            ) : (
              summary.poolDebugRows.map((row) => (
                <tr key={row.poolId} className="border-b border-ash-border/40">
                  <td className="px-2 py-2 font-medium text-ash-text">{row.poolName}</td>
                  <td className="px-2 py-2 text-ash-text">
                    {groupAdvanceLabel(
                      row.groupAdvanceExactPoints,
                      row.groupAdvanceWrongSlotPoints,
                    )}
                  </td>
                  <td className="px-2 py-2 text-ash-text">{row.scoringRuleCount}</td>
                  <td className="px-2 py-2 text-ash-text">{row.pointsLedgerRowCount}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
