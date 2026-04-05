import type { PublicLeaderboardPoolSection } from "../../types/leaderboard";
import Link from "next/link";

function rowHighlightClass(rank: number): string {
  if (rank === 1) return "border-l-4 border-amber-500 bg-amber-50/90";
  if (rank === 2) return "border-l-4 border-zinc-400 bg-zinc-100/80";
  if (rank === 3) return "border-l-4 border-orange-400 bg-orange-50/70";
  return "border-l-4 border-transparent";
}

type Props = {
  errorMessage: string | null;
  sections: PublicLeaderboardPoolSection[];
  /** When true, names link to `/participant/[id]` (add that route before enabling). */
  nameLinks?: boolean;
};

export function PublicLeaderboard({
  errorMessage,
  sections,
  nameLinks = false,
}: Props) {
  if (errorMessage) {
    return (
      <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
        Could not load the leaderboard: {errorMessage}
      </p>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50/80 px-4 py-10 text-center">
        <p className="text-sm font-medium text-zinc-800">No public standings yet</p>
        <p className="mt-2 text-sm text-zinc-600">
          When a pool is set to public and scores exist, rankings will show here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {sections.map((section) => (
        <section key={section.poolId}>
          <h2 className="text-lg font-semibold text-zinc-900">{section.poolName}</h2>
          <div className="mt-2 overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-medium uppercase tracking-wide text-zinc-600">
                <tr>
                  <th className="w-16 px-3 py-2">Rank</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2 text-right">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {section.rows.map((r) => (
                  <tr key={r.participantId} className={rowHighlightClass(r.rank)}>
                    <td className="px-3 py-2 font-medium tabular-nums text-zinc-900">
                      {r.rank}
                    </td>
                    <td className="px-3 py-2 text-zinc-800">
                      {nameLinks ? (
                        <Link
                          href={`/participant/${r.participantId}`}
                          className="underline-offset-2 hover:text-zinc-900 hover:underline focus:outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
                        >
                          {r.displayName}
                        </Link>
                      ) : (
                        <span>{r.displayName}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums text-zinc-900">
                      {r.totalPoints}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
