import { syncNhlOfficialRound1FromBracketAction } from "../../app/nhl/admin/actions";

export function NhlAdminSyncOfficialRound1Form() {
  return (
    <form
      action={syncNhlOfficialRound1FromBracketAction}
      className="rounded-lg border border-blue-500/25 bg-slate-950/50 px-4 py-4"
    >
      <p className="text-sm font-medium text-ash-text">Sync official bracket results</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        Fetches the public NHL playoff bracket and writes Round 1 and Round 2 winners, scores, and
        status into the active edition when the league marks a series decided. Refreshes Round 2
        matchup slots from Round 1 winners. Skips slots where you already set a different winner.
      </p>
      <button
        type="submit"
        className="mt-3 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500"
      >
        Run sync now
      </button>
    </form>
  );
}
