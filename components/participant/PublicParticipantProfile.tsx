import Link from "next/link";
import { groupPicksByStage } from "../../lib/participant/groupPicksByStage";
import { formatPickSlot } from "../../lib/participant/pickDescription";
import { labelPredictionKind } from "../../lib/participant/predictionKindLabels";
import type { PublicParticipantDetail } from "../../types/publicParticipant";

function emptyBox(message: string, hint: string) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50/80 px-4 py-8 text-center">
      <p className="text-sm font-medium text-zinc-800">{message}</p>
      <p className="mt-2 text-sm text-zinc-600">{hint}</p>
    </div>
  );
}

function tableShell(children: React.ReactNode) {
  return (
    <div className="mt-2 overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
      {children}
    </div>
  );
}

type Props = {
  detail: PublicParticipantDetail;
};

export function PublicParticipantProfile({ detail }: Props) {
  const stageSections = groupPicksByStage(detail.picks);

  return (
    <div className="space-y-10">
      <div>
        <Link
          href="/"
          className="text-sm font-medium text-emerald-700 underline-offset-4 hover:underline"
        >
          ← Standings
        </Link>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-zinc-600">{detail.poolName}</p>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Total points
            </dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-900">
              {detail.totalPoints}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Rank
            </dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-900">
              {detail.rank}
            </dd>
          </div>
        </dl>
      </div>

      <section>
        <h2 className="text-lg font-semibold text-zinc-900">Picks by stage</h2>
        {stageSections.length === 0 ? (
          emptyBox(
            "No picks on file",
            "Picks will appear here once they are entered for this pool.",
          )
        ) : (
          <div className="space-y-8">
            {stageSections.map((section) => (
              <div key={section.stageCode ?? section.stageLabel}>
                <h3 className="text-sm font-medium text-zinc-700">
                  {section.stageLabel}
                </h3>
                {tableShell(
                  <table className="w-full min-w-[420px] text-left text-sm">
                    <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-medium uppercase tracking-wide text-zinc-600">
                      <tr>
                        <th className="px-3 py-2">Pick type</th>
                        <th className="px-3 py-2">Slot</th>
                        <th className="px-3 py-2">Team</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {section.picks.map((p) => (
                        <tr key={p.predictionId}>
                          <td className="px-3 py-2 text-zinc-800">
                            {labelPredictionKind(p.predictionKind)}
                          </td>
                          <td className="px-3 py-2 text-zinc-600">
                            {formatPickSlot(p)}
                          </td>
                          <td className="px-3 py-2 text-zinc-800">
                            {p.teamName ? (
                              <span>
                                {p.teamName}
                                {p.teamCountryCode ? (
                                  <span className="text-zinc-500">
                                    {" "}
                                    ({p.teamCountryCode})
                                  </span>
                                ) : null}
                              </span>
                            ) : (
                              <span className="text-zinc-400">—</span>
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
        <h2 className="text-lg font-semibold text-zinc-900">
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
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-medium uppercase tracking-wide text-zinc-600">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2 text-right">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {detail.ledger.map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap px-3 py-2 text-zinc-600">
                      {new Date(row.createdAt).toLocaleString("en-US", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="px-3 py-2 text-zinc-800">
                      {labelPredictionKind(row.predictionKind)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-medium tabular-nums ${
                        row.pointsDelta > 0
                          ? "text-emerald-700"
                          : row.pointsDelta < 0
                            ? "text-red-700"
                            : "text-zinc-900"
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
