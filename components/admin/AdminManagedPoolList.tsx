import type { ManagedPoolRow } from "@/lib/pools/fetchManagedPoolsForViewer";
import { formatParticipantCountLabel } from "@/lib/pools/formatParticipantCountLabel";
import Link from "next/link";

export type AdminManagedPoolListItem = Pick<
  ManagedPoolRow,
  "id" | "name" | "is_simulation"
> & {
  participantCount: number;
};

type Props = {
  pools: AdminManagedPoolListItem[];
};

export function AdminManagedPoolList({ pools }: Props) {
  if (pools.length === 0) return null;

  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-ash-border bg-ash-body/40">
      <table className="w-full min-w-[20rem] text-left text-sm">
        <thead>
          <tr className="border-b border-ash-border text-xs uppercase tracking-wide text-ash-muted">
            <th className="px-4 py-2.5 font-medium">Pool</th>
            <th className="px-4 py-2.5 font-medium">Participants</th>
            <th className="px-4 py-2.5 font-medium sr-only">Actions</th>
          </tr>
        </thead>
        <tbody>
          {pools.map((pool) => {
            const countLabel = formatParticipantCountLabel(pool.participantCount);
            const zeroParticipants = pool.participantCount === 0;

            return (
              <tr
                key={pool.id}
                className="border-b border-ash-border/60 last:border-b-0"
              >
                <td className="px-4 py-3 align-top">
                  <Link
                    href={`/admin/pools/${pool.id}`}
                    className="font-medium text-ash-text ash-link"
                  >
                    {pool.name}
                  </Link>
                  {pool.is_simulation ? (
                    <div className="mt-1">
                      <span className="rounded bg-amber-950/50 px-2 py-0.5 text-xs font-medium text-amber-200">
                        Simulation
                      </span>
                    </div>
                  ) : null}
                </td>
                <td
                  className={`px-4 py-3 align-top text-xs ${
                    zeroParticipants ? "text-ash-muted/70" : "text-ash-muted"
                  }`}
                >
                  {countLabel}
                </td>
                <td className="px-4 py-3 align-top text-right text-xs text-ash-muted">
                  <Link
                    href={`/admin/pools/${pool.id}`}
                    className="ash-link whitespace-nowrap"
                  >
                    Manage →
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
