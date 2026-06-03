import type { NhlDraft26ConsensusBoard } from "@/lib/nhldraft26/leaderboard/consensus";
import type { NhlDraft26PublicEntrySummary } from "@/lib/nhldraft26/leaderboard/queries";
import type { NhlDraft26Prospect } from "@/lib/nhldraft26/prospectsSeed";
import Link from "next/link";

type Props = {
  board: NhlDraft26ConsensusBoard;
  entries: NhlDraft26PublicEntrySummary[];
  prospectById: Map<string, NhlDraft26Prospect>;
};

function formatUpdatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function prospectName(
  prospectId: string,
  prospectById: Map<string, NhlDraft26Prospect>,
): string {
  return prospectById.get(prospectId)?.name ?? prospectId;
}

export function NhlDraft26CommunityLeaderboard({
  board,
  entries,
  prospectById,
}: Props) {
  if (board.boardCount === 0) {
    return (
      <section className="ash-surface px-4 py-10 text-center sm:px-5">
        <p className="text-lg font-medium text-slate-200">No submitted boards yet</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">
          Be the first to post a public top 10 with a leaderboard name. Standings will appear here
          after the real draft results are entered.
        </p>
        <div className="mt-6">
          <Link href="/nhldraft26/picks" className="btn-primary no-underline">
            Make my picks
          </Link>
        </div>
      </section>
    );
  }

  const mostCommonOneLabel = board.mostCommonNumberOne
    ? `${prospectName(board.mostCommonNumberOne.prospectId, prospectById)} (${board.mostCommonNumberOne.count} of ${board.boardCount} boards)`
    : "—";

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="ash-surface px-4 py-3 sm:px-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Submitted boards
          </p>
          <p className="mt-1 text-2xl font-semibold text-ash-text">{board.boardCount}</p>
        </div>
        <div className="ash-surface px-4 py-3 sm:px-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Unique prospects
          </p>
          <p className="mt-1 text-2xl font-semibold text-ash-text">{board.uniqueProspectCount}</p>
        </div>
        <div className="ash-surface px-4 py-3 sm:px-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Most common #1
          </p>
          <p className="mt-1 text-sm font-semibold leading-snug text-ash-text">
            {mostCommonOneLabel}
          </p>
        </div>
      </section>

      <section className="ash-surface overflow-hidden px-0 py-0 sm:px-0">
        <div className="border-b border-slate-700/50 px-4 py-3 sm:px-5">
          <h2 className="text-lg font-semibold text-ash-text">Consensus top 10</h2>
          <p className="mt-1 text-sm text-slate-400">
            Ranked by community points (pick 1 = 10 pts … pick 10 = 1 pt).
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700/50 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 font-medium sm:px-5">#</th>
                <th className="px-4 py-2 font-medium sm:px-5">Prospect</th>
                <th className="px-4 py-2 font-medium sm:px-5">Pos</th>
                <th className="px-4 py-2 font-medium sm:px-5">Team/league</th>
                <th className="px-4 py-2 font-medium sm:px-5">Boards</th>
                <th className="px-4 py-2 font-medium sm:px-5">Avg pick</th>
                <th className="px-4 py-2 font-medium sm:px-5">#1 votes</th>
              </tr>
            </thead>
            <tbody>
              {board.consensusRows.slice(0, 10).map((row) => {
                const p = prospectById.get(row.prospectId);
                return (
                  <tr
                    key={row.prospectId}
                    className="border-b border-slate-800/60 last:border-0"
                  >
                    <td className="px-4 py-2.5 text-slate-400 sm:px-5">{row.rank}</td>
                    <td className="px-4 py-2.5 font-medium text-ash-text sm:px-5">
                      {p?.name ?? row.prospectId}
                    </td>
                    <td className="px-4 py-2.5 text-slate-400 sm:px-5">{p?.position ?? "—"}</td>
                    <td className="px-4 py-2.5 text-slate-400 sm:px-5">
                      {p?.teamLeague ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-slate-300 sm:px-5">{row.boardsSelected}</td>
                    <td className="px-4 py-2.5 text-slate-300 sm:px-5">
                      {row.averagePick.toFixed(1)}
                    </td>
                    <td className="px-4 py-2.5 text-slate-300 sm:px-5">{row.numberOneVotes}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ash-surface px-4 py-4 sm:px-5">
        <h2 className="text-lg font-semibold text-ash-text">Most picked by draft slot</h2>
        <ul className="mt-3 space-y-2">
          {board.slotFavorites.map((slot) => (
            <li
              key={slot.pickNumber}
              className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-slate-700/40 bg-slate-950/40 px-3 py-2 text-sm"
            >
              <span className="font-medium text-amber-100/90">Pick {slot.pickNumber}</span>
              <span className="text-slate-200">
                {prospectName(slot.prospectId, prospectById)}
                <span className="text-slate-500">
                  {" "}
                  — {slot.count} of {slot.boardCount} boards ({slot.percentage}%)
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="ash-surface px-4 py-4 sm:px-5">
        <h2 className="text-lg font-semibold text-ash-text">Submitted entries</h2>
        <ul className="mt-3 divide-y divide-slate-800/70">
          {entries.map((entry) => (
            <li
              key={entry.entryId}
              className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
            >
              <div>
                <p className="font-medium text-ash-text">{entry.displayName}</p>
                <p className="text-xs text-slate-500">Updated {formatUpdatedAt(entry.updatedAt)}</p>
              </div>
              <Link
                href={`/nhldraft26/entry/${entry.entryId}`}
                className="text-sm font-medium text-amber-300/90 no-underline hover:underline"
              >
                View picks
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
