import { recordNhlSeriesLedgerAction } from "@/lib/nhl/admin/recordNhlSeriesLedgerAction";
import type { NhlSeries } from "@/lib/nhl/types";

type Props = {
  seriesId: string;
  higherAbbr: string;
  lowerAbbr: string;
  gamesWonHigher: number;
  gamesWonLower: number;
  status: NhlSeries["status"];
};

/** Global admin: games won (higher vs lower seed) and series status shown on public NHL pages. */
export function NhlAdminSeriesLedgerForm({
  seriesId,
  higherAbbr,
  lowerAbbr,
  gamesWonHigher,
  gamesWonLower,
  status,
}: Props) {
  return (
    <form
      action={recordNhlSeriesLedgerAction}
      className="flex flex-col gap-2 text-[11px] text-slate-300 xl:min-w-[200px]"
    >
      <input type="hidden" name="seriesId" value={seriesId} />
      <span className="font-medium uppercase tracking-wide text-slate-500">Live ledger</span>
      <div className="flex flex-wrap items-center gap-1">
        <label className="sr-only" htmlFor={`hi-${seriesId}`}>
          Games won ({higherAbbr}, higher seed)
        </label>
        <span className="font-mono text-slate-500">{higherAbbr}</span>
        <input
          id={`hi-${seriesId}`}
          name="gamesWonHigher"
          type="number"
          min={0}
          max={7}
          defaultValue={gamesWonHigher}
          className="w-12 rounded-md border border-blue-500/25 bg-slate-950/80 px-1.5 py-1 text-center tabular-nums text-slate-100"
        />
        <span className="tabular-nums text-slate-600">:</span>
        <input
          id={`lo-${seriesId}`}
          name="gamesWonLower"
          type="number"
          min={0}
          max={7}
          defaultValue={gamesWonLower}
          className="w-12 rounded-md border border-blue-500/25 bg-slate-950/80 px-1.5 py-1 text-center tabular-nums text-slate-100"
        />
        <span className="font-mono text-slate-500">{lowerAbbr}</span>
        <label className="sr-only" htmlFor={`lo-${seriesId}`}>
          Games won ({lowerAbbr}, lower seed)
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <label className="text-slate-500" htmlFor={`st-${seriesId}`}>
          Status
        </label>
        <select
          id={`st-${seriesId}`}
          name="seriesStatus"
          defaultValue={status}
          className="grow rounded-md border border-blue-500/25 bg-slate-950/80 px-2 py-1 text-slate-200"
        >
          <option value="pending">Pending</option>
          <option value="in_progress">In progress</option>
          <option value="complete">Complete</option>
        </select>
      </div>
      <button
        type="submit"
        className="rounded-md border border-sky-600/45 bg-sky-950/40 px-2 py-1 font-medium text-sky-100/95 hover:bg-sky-900/45"
      >
        Save score &amp; status
      </button>
      <p className="leading-snug text-slate-500">
        Wins are bracket order (higher seed vs lower seed). Combine with Winner under “Record result”
        when the series is decided.
      </p>
    </form>
  );
}
