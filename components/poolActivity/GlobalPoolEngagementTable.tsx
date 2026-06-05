import { formatRelativeTimeEn } from "@/lib/datetime/formatRelativeTimeEn";
import type { GlobalPoolEngagementOverviewRow } from "@/lib/poolActivity/globalActivityTypes";
import Link from "next/link";

type Props = {
  rows: GlobalPoolEngagementOverviewRow[];
};

export function GlobalPoolEngagementTable({ rows }: Props) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <section className="mb-8">
      <h2 className="text-sm font-semibold text-ash-text">Pool engagement</h2>
      <p className="mt-1 text-sm text-ash-muted">
        Quick scan of activity across pools (last 24h counts).
      </p>
      <div className="mt-3 overflow-x-auto rounded-xl border border-ash-border">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-ash-border bg-ash-body/40 text-xs uppercase tracking-wide text-ash-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Pool</th>
              <th className="px-3 py-2 font-medium">Participants</th>
              <th className="px-3 py-2 font-medium">Completed brackets</th>
              <th className="px-3 py-2 font-medium">Last activity</th>
              <th className="px-3 py-2 font-medium">Activity 24h</th>
              <th className="px-3 py-2 font-medium">Reactions 24h</th>
              <th className="px-3 py-2 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ash-border/80">
            {rows.map((row) => (
              <tr key={row.poolId} className="bg-ash-surface/50">
                <td className="px-3 py-2 font-medium text-ash-text">
                  {row.poolName}
                </td>
                <td className="px-3 py-2 tabular-nums text-ash-muted">
                  {row.participantCount}
                </td>
                <td className="px-3 py-2 tabular-nums text-ash-muted">
                  {row.completedBrackets ?? "—"}
                </td>
                <td className="px-3 py-2 text-ash-muted">
                  {row.lastActivityAt
                    ? formatRelativeTimeEn(row.lastActivityAt)
                    : "—"}
                </td>
                <td className="px-3 py-2 tabular-nums text-ash-muted">
                  {row.activityCount24h}
                </td>
                <td className="px-3 py-2 tabular-nums text-ash-muted">
                  {row.reactionsCount24h}
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={`/admin/activity?pool=${row.poolId}`}
                    className="ash-link text-xs font-medium"
                  >
                    View activity
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
