import { recordNhlSeriesWinnerAction } from "@/lib/nhl/admin/recordNhlSeriesWinnerAction";

type Props = {
  seriesId: string;
  higherTeamId: string;
  lowerTeamId: string;
  higherAbbr: string;
  lowerAbbr: string;
  currentWinnerTeamId: string | null;
};

/**
 * Minimal admin control to record a series winner for NHL scoring (global admin layout only).
 */
export function NhlAdminSeriesWinnerForm({
  seriesId,
  higherTeamId,
  lowerTeamId,
  higherAbbr,
  lowerAbbr,
  currentWinnerTeamId,
}: Props) {
  return (
    <form
      action={recordNhlSeriesWinnerAction}
      className="flex flex-wrap items-center gap-2 text-xs"
    >
      <input type="hidden" name="seriesId" value={seriesId} />
      <label className="sr-only" htmlFor={`winner-${seriesId}`}>
        Series winner
      </label>
      <select
        id={`winner-${seriesId}`}
        name="winnerTeamId"
        defaultValue={currentWinnerTeamId ?? ""}
        className="rounded-md border border-blue-500/25 bg-slate-950/80 px-2 py-1.5 font-mono text-slate-200"
      >
        <option value="">No winner</option>
        <option value={higherTeamId}>{higherAbbr || "Higher"} wins</option>
        <option value={lowerTeamId}>{lowerAbbr || "Lower"} wins</option>
      </select>
      <button
        type="submit"
        className="rounded-md border border-emerald-600/50 bg-emerald-950/40 px-2 py-1.5 font-medium text-emerald-100/95 hover:bg-emerald-900/50"
      >
        Save
      </button>
    </form>
  );
}
