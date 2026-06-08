import type { OfficialR32ReadinessSummary } from "../../lib/admin/officialRoundOf32Readiness";

type Props = {
  summary: OfficialR32ReadinessSummary;
};

export function AdminResultsR32StatusSummary({ summary }: Props) {
  return (
    <div className="mb-6 rounded-lg border border-ash-border/60 bg-ash-body/25 px-4 py-3 text-sm text-ash-text">
      <p className="text-xs font-semibold uppercase tracking-wide text-ash-muted">
        Round of 32 readiness
      </p>
      <ul className="mt-2 space-y-1 text-ash-muted">
        <li>
          Groups with official 1st + 2nd:{" "}
          <span className="font-medium text-ash-text">{summary.groupsComplete}/12</span>
        </li>
        <li>
          Third-place advancers entered:{" "}
          <span className="font-medium text-ash-text">
            {summary.thirdPlaceQualifiersEntered}/8
          </span>
        </li>
        <li>
          Annex C resolution:{" "}
          <span
            className={
              summary.officialR32Resolvable ? "font-medium text-emerald-200" : "font-medium text-amber-200"
            }
          >
            {summary.officialR32Resolvable ? "Yes — preview can run" : "Not yet"}
          </span>
          {!summary.officialR32Resolvable && summary.resolvableHint ? (
            <span className="mt-1 block text-xs text-ash-muted/90">
              {summary.resolvableHint}
            </span>
          ) : null}
        </li>
      </ul>
    </div>
  );
}
