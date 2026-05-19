import type { PoolPilotVerificationSnapshot } from "@/lib/admin/fetchPoolPilotVerification";
import Link from "next/link";

function formatWhen(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

function freshnessBadge(freshness: "never" | "fresh" | "stale") {
  if (freshness === "fresh") {
    return (
      <span className="rounded bg-emerald-950/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-200">
        Recent
      </span>
    );
  }
  if (freshness === "stale") {
    return (
      <span className="rounded bg-amber-950/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-200">
        Stale
      </span>
    );
  }
  return (
    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-300">
      Never
    </span>
  );
}

function PoolTable({
  title,
  rows,
  emptyMessage,
}: {
  title: string;
  rows: PoolPilotVerificationSnapshot["livePools"];
  emptyMessage: string;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-ash-text">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-ash-muted">{emptyMessage}</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead>
              <tr className="border-b border-ash-border text-xs uppercase text-ash-muted">
                <th className="py-2 pr-3">Pool</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3">Edition</th>
                <th className="py-2 pr-3">People</th>
                <th className="py-2 pr-3">Standings updated</th>
                <th className="py-2">Last trigger</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.poolId} className="border-b border-ash-border/40">
                  <td className="py-2 pr-3">
                    <Link
                      href={`/admin/pools/${r.poolId}/standings`}
                      className="ash-link font-medium text-ash-text"
                    >
                      {r.poolName}
                    </Link>
                    <div className="mt-0.5">{freshnessBadge(r.freshness)}</div>
                  </td>
                  <td className="py-2 pr-3 text-ash-muted">
                    {r.isSimulation ? (
                      <span className="text-amber-200">Simulation</span>
                    ) : (
                      <span className="text-emerald-200">Live</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-ash-muted">
                    {r.editionName ?? "—"}
                    {r.editionCode ? (
                      <span className="block font-mono text-[10px]">{r.editionCode}</span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3 text-ash-muted">{r.participantCount}</td>
                  <td className="py-2 pr-3 text-ash-muted">
                    {formatWhen(r.lastSuccessAt)}
                  </td>
                  <td className="py-2 text-ash-muted">{r.lastTriggerLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type Props = {
  snapshot: PoolPilotVerificationSnapshot;
};

export function PoolPilotVerificationPanel({ snapshot }: Props) {
  if (snapshot.loadError) {
    return (
      <p className="rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
        {snapshot.loadError}
      </p>
    );
  }

  return (
    <section className="ash-surface space-y-6 p-4">
      <div>
        <h2 className="text-sm font-bold text-ash-text">Pilot verification</h2>
        <p className="mt-1 text-sm text-ash-muted">
          Live vs simulation pools, editions, headcount, and when standings were last
          recalculated. After simulation-only work, live pools should keep the same
          “standings updated” time and the same snapshot hash on the pilot page.
        </p>
      </div>
      <PoolTable
        title="Live pools"
        rows={snapshot.livePools}
        emptyMessage="No live pools found."
      />
      <PoolTable
        title="Simulation pools"
        rows={snapshot.simulationPools}
        emptyMessage="No simulation pools yet — create one under Simulation testing."
      />
    </section>
  );
}
