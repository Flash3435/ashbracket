import type { PublicLeaderboardPoolSection } from "../../types/leaderboard";
import { formatPoolPoints } from "@/lib/format/poolPoints";
import Link from "next/link";

function rowHighlightClass(rank: number): string {
  if (rank === 1)
    return "border-l-4 border-amber-500 bg-amber-500/10";
  if (rank === 2)
    return "border-l-4 border-slate-400 bg-slate-400/10";
  if (rank === 3)
    return "border-l-4 border-orange-400 bg-orange-500/10";
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
      <p
        className="rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200"
        role="alert"
      >
        Could not load the leaderboard: {errorMessage}
      </p>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="ash-surface px-4 py-10 text-center">
        <p className="text-3xl" aria-hidden>
          🏆
        </p>
        <p className="mt-3 text-sm font-medium text-ash-text">
          Nothing on the board yet
        </p>
        <p className="mt-2 text-sm font-normal text-ash-muted">
          Once your pool is public and scores start rolling in, rankings will
          show up here automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {sections.map((section) => (
        <section key={section.poolId}>
          <h2 className="text-lg font-bold text-ash-text">{section.poolName}</h2>
          <div className="ash-surface mt-2 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="border-b border-ash-border bg-ash-body/50 text-xs font-medium uppercase tracking-wide text-ash-muted">
                <tr>
                  <th className="w-16 px-3 py-2">Rank</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2 text-right">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ash-border">
                {section.rows.map((r) => (
                  <tr key={r.participantId} className={rowHighlightClass(r.rank)}>
                    <td className="px-3 py-2 font-medium tabular-nums text-ash-text">
                      {r.rank}
                    </td>
                    <td className="px-3 py-2 text-ash-muted">
                      {nameLinks ? (
                        <Link
                          href={`/participant/${r.participantId}`}
                          className="text-ash-text underline-offset-2 hover:text-ash-accent hover:underline focus:outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ash-accent focus-visible:ring-offset-2 focus-visible:ring-offset-ash-surface"
                        >
                          {r.displayName}
                        </Link>
                      ) : (
                        <span>{r.displayName}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums text-ash-text">
                      {formatPoolPoints(r.totalPoints)}
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
