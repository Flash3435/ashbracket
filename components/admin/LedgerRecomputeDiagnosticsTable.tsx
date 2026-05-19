import {
  labelWcLedgerRecomputeTrigger,
  wcLedgerRecomputeFreshnessBadge,
  type WcPoolLedgerRecomputeRow,
} from "@/lib/admin/wcLedgerRecomputeDiagnostics";

function shortPoolId(id: string): string {
  if (id.length <= 10) return id;
  return `${id.slice(0, 8)}…`;
}

function formatWhen(iso: string | null | undefined): string {
  if (iso == null || iso === "") return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

function StatusBadge({ row }: { row: WcPoolLedgerRecomputeRow }) {
  const b = wcLedgerRecomputeFreshnessBadge(row.lastSuccessAt);
  if (b === "never") {
    return (
      <span className="rounded bg-slate-800/80 px-2 py-0.5 text-xs font-medium text-slate-300">
        Unknown
      </span>
    );
  }
  if (b === "fresh") {
    return (
      <span className="rounded bg-emerald-950/60 px-2 py-0.5 text-xs font-medium text-emerald-200">
        Recent
      </span>
    );
  }
  return (
    <span className="rounded bg-amber-950/50 px-2 py-0.5 text-xs font-medium text-amber-200">
      Stale
    </span>
  );
}

type Props = {
  title?: string;
  description?: string;
  rows: WcPoolLedgerRecomputeRow[];
  loadError: string | null;
};

export function LedgerRecomputeDiagnosticsTable({
  title = "Ledger recompute (per pool)",
  description = "Last successful leaderboard recompute for each World Cup pool. Internal diagnostic only.",
  rows,
  loadError,
}: Props) {
  return (
    <section className="ash-surface mb-6 p-4">
      <h2 className="text-base font-bold text-ash-text">{title}</h2>
      <p className="mt-1 text-sm text-ash-muted">{description}</p>
      <p className="mt-2 text-xs text-ash-muted">
        “Recent” means the last successful recompute was within about two hours (UI hint only).
      </p>
      {loadError ? (
        <p className="mt-3 rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {loadError}
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[32rem] border-collapse text-left text-sm text-ash-muted">
            <thead>
              <tr className="border-b border-ash-border text-xs uppercase tracking-wide text-ash-border-hover">
                <th className="py-2 pr-3 font-medium text-ash-text">Pool</th>
                <th className="py-2 pr-3 font-medium text-ash-text">Pool id</th>
                <th className="py-2 pr-3 font-medium text-ash-text">Last recompute</th>
                <th className="py-2 pr-3 font-medium text-ash-text">Trigger</th>
                <th className="py-2 pr-3 font-medium text-ash-text">Recorded status</th>
                <th className="py-2 font-medium text-ash-text">Freshness</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.poolId} className="border-b border-ash-border/60">
                  <td className="py-2 pr-3 font-medium text-ash-text">{row.poolName}</td>
                  <td className="py-2 pr-3 font-mono text-xs text-ash-muted">
                    {shortPoolId(row.poolId)}
                  </td>
                  <td className="py-2 pr-3">{formatWhen(row.lastSuccessAt)}</td>
                  <td className="py-2 pr-3">{labelWcLedgerRecomputeTrigger(row.lastTrigger)}</td>
                  <td className="py-2 pr-3">
                    {row.lastSuccessAt == null ? "—" : (row.lastStatus ?? "ok")}
                  </td>
                  <td className="py-2">
                    <StatusBadge row={row} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
