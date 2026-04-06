import Link from "next/link";
import { groupPicksByStage } from "../../lib/participant/groupPicksByStage";
import { formatPickSlot } from "../../lib/participant/pickDescription";
import { labelPredictionKind } from "../../lib/participant/predictionKindLabels";
import type { PublicParticipantDetail } from "../../types/publicParticipant";

function emptyBox(message: string, hint: string) {
  return (
    <div className="ash-surface px-4 py-8 text-center">
      <p className="text-sm font-medium text-ash-text">{message}</p>
      <p className="mt-2 text-sm text-ash-muted">{hint}</p>
    </div>
  );
}

function tableShell(children: React.ReactNode) {
  return <div className="ash-surface mt-2 overflow-x-auto">{children}</div>;
}

type Props = {
  detail: PublicParticipantDetail;
};

export function PublicParticipantProfile({ detail }: Props) {
  const stageSections = groupPicksByStage(detail.picks);

  return (
    <div className="space-y-10">
      <div>
        <Link href="/" className="ash-link text-sm">
          ← Standings
        </Link>
      </div>

      <div className="ash-surface p-4">
        <p className="text-sm text-ash-muted">{detail.poolName}</p>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-ash-muted">
              Total points
            </dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-ash-text">
              {detail.totalPoints}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-ash-muted">
              Rank
            </dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-ash-text">
              {detail.rank}
            </dd>
          </div>
        </dl>
      </div>

      <section>
        <h2 className="text-lg font-bold text-ash-text">Picks by stage</h2>
        {stageSections.length === 0 ? (
          emptyBox(
            "No picks on file",
            "Picks will appear here once they are entered for this pool.",
          )
        ) : (
          <div className="space-y-8">
            {stageSections.map((section) => (
              <div key={section.stageCode ?? section.stageLabel}>
                <h3 className="text-sm font-medium text-ash-muted">
                  {section.stageLabel}
                </h3>
                {tableShell(
                  <table className="w-full min-w-[420px] text-left text-sm">
                    <thead className="border-b border-ash-border bg-ash-body/50 text-xs font-medium uppercase tracking-wide text-ash-muted">
                      <tr>
                        <th className="px-3 py-2">Pick type</th>
                        <th className="px-3 py-2">Slot</th>
                        <th className="px-3 py-2">Team</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ash-border">
                      {section.picks.map((p) => (
                        <tr key={p.predictionId}>
                          <td className="px-3 py-2 text-ash-muted">
                            {labelPredictionKind(p.predictionKind)}
                          </td>
                          <td className="px-3 py-2 text-ash-border-hover">
                            {formatPickSlot(p)}
                          </td>
                          <td className="px-3 py-2 text-ash-muted">
                            {p.teamName ? (
                              <span>
                                {p.teamName}
                                {p.teamCountryCode ? (
                                  <span className="text-ash-border-hover">
                                    {" "}
                                    ({p.teamCountryCode})
                                  </span>
                                ) : null}
                              </span>
                            ) : (
                              <span className="text-ash-border">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>,
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-bold text-ash-text">
          Points history
        </h2>
        {detail.ledger.length === 0 ? (
          emptyBox(
            "No points recorded yet",
            "Ledger entries appear after match results are saved and scores are recomputed.",
          )
        ) : (
          tableShell(
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="border-b border-ash-border bg-ash-body/50 text-xs font-medium uppercase tracking-wide text-ash-muted">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2 text-right">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ash-border">
                {detail.ledger.map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap px-3 py-2 text-ash-border-hover">
                      {new Date(row.createdAt).toLocaleString("en-US", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="px-3 py-2 text-ash-muted">
                      {labelPredictionKind(row.predictionKind)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-medium tabular-nums ${
                        row.pointsDelta > 0
                          ? "text-ash-accent"
                          : row.pointsDelta < 0
                            ? "text-red-400"
                            : "text-ash-text"
                      }`}
                    >
                      {row.pointsDelta > 0 ? "+" : ""}
                      {row.pointsDelta}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>,
          )
        )}
      </section>
    </div>
  );
}
