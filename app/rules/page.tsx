import Link from "next/link";
import { formatPoolPoints } from "@/lib/format/poolPoints";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { fetchSamplePoolScoringRules } from "../../lib/rules/fetchSamplePoolScoringRules";
import type { PoolPrizeTier } from "../../types/publicScoringRules";

export const dynamic = "force-dynamic";

function formatLockAt(iso: string | null): string | null {
  if (iso == null) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-US", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "UTC",
  });
}

function formatEntryFee(cents: number | null): string | null {
  if (cents == null || cents < 0) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function describePrizeTier(tier: PoolPrizeTier): string {
  if (tier.remainder) {
    return `${tier.label}: the rest of the prize pool after the places above`;
  }
  if (typeof tier.percent === "number") {
    return `${tier.label}: ${tier.percent}% of the pool`;
  }
  return tier.label;
}

export default async function RulesPage() {
  const result = await fetchSamplePoolScoringRules();

  if (!result.ok && result.kind === "error") {
    return (
      <PageContainer>
        <PageTitle
          title="Pool rules"
          description="How this pool works — entry, prizes, and scoring."
        />
        <p className="rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          Could not load pool rules: {result.message}
        </p>
        <p className="text-sm text-ash-muted">
          <Link href="/" className="ash-link">
            ← Back to standings
          </Link>
        </p>
      </PageContainer>
    );
  }

  if (!result.ok && result.kind === "empty") {
    return (
      <PageContainer>
        <PageTitle
          title="Pool rules"
          description="How this pool works — entry, prizes, and scoring."
        />
        <div className="ash-surface px-4 py-10 text-center">
          <p className="text-sm font-medium text-ash-text">
            No public pool rules yet
          </p>
          <p className="mt-2 text-sm text-ash-muted">
            The sample pool may not be marked public, or the host has not
            published rules yet. Check with the organizer.
          </p>
        </div>
        <p className="text-sm text-ash-muted">
          <Link href="/" className="ash-link">
            ← Back to standings
          </Link>
        </p>
      </PageContainer>
    );
  }

  const { data } = result;
  const lockLabel = formatLockAt(data.lockAt);
  const feeLabel = formatEntryFee(data.entryFeeCents);

  return (
    <PageContainer>
      <PageTitle
        title="Pool rules"
        description={
          lockLabel
            ? `${data.poolName} — picks lock ${lockLabel} (UTC).`
            : `${data.poolName} — how points and prizes work.`
        }
      />

      <div className="space-y-6">
        {feeLabel ? (
          <section className="ash-surface px-4 py-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ash-muted">
              Entry fee
            </h2>
            <p className="mt-2 text-lg font-medium text-ash-text">{feeLabel}</p>
            <p className="mt-1 text-sm text-ash-muted">
              One entry per person unless the organizer says otherwise.
            </p>
          </section>
        ) : null}

        {data.prizeTiers.length > 0 ? (
          <section className="ash-surface px-4 py-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ash-muted">
              Prize pool
            </h2>
            <p className="mt-2 text-sm text-ash-muted">
              Payouts are a share of the total collected entry fees (after any
              host fees the organizer announces).
            </p>
            <ul className="mt-3 list-inside list-disc space-y-1.5 text-sm text-ash-text">
              {data.prizeTiers.map((tier) => (
                <li key={tier.place}>{describePrizeTier(tier)}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="ash-surface px-4 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ash-muted">
            How you earn points
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ash-muted">
            Scores are added automatically when official results are recorded.
            Your picks are compared to those results — no manual grading.
          </p>

          {data.groupAdvance ? (
            <div className="mt-4 rounded-lg border border-ash-border bg-ash-body/40 px-3 py-3">
              <h3 className="text-sm font-semibold text-ash-text">
                Group stage (finish in 1st or 2nd in the group)
              </h3>
              <ul className="mt-2 list-inside list-disc space-y-1.5 text-sm text-ash-muted">
                <li>
                  <span className="text-ash-text">
                    {formatPoolPoints(data.groupAdvance.exactPoints)} points
                  </span>{" "}
                  if you put the team in the{" "}
                  <span className="font-medium text-ash-text">correct</span>{" "}
                  spot — first in the group where they actually finish first, or
                  second where they actually finish second.
                </li>
                <li>
                  <span className="text-ash-text">
                    {formatPoolPoints(data.groupAdvance.wrongSlotPoints)} points
                  </span>{" "}
                  if the team{" "}
                  <span className="font-medium text-ash-text">
                    still advances
                  </span>{" "}
                  from the group but you had them in the other qualifying slot
                  (for example you picked them 1st and they placed 2nd, or the
                  other way around).
                </li>
                <li className="list-none pl-0 text-ash-muted">
                  No points if the team does not advance from the group.
                </li>
              </ul>
            </div>
          ) : null}

          {data.rules.length > 0 ? (
            <>
              <h3 className="mt-5 text-sm font-semibold text-ash-text">
                Knockout round picks &amp; bonuses
              </h3>
              <p className="mt-1 text-sm text-ash-muted">
                Each correct pick below scores once when that result is final.
              </p>
              <div className="mt-3 overflow-x-auto rounded-md border border-ash-border">
                <table className="w-full min-w-[320px] text-left text-sm">
                  <thead className="border-b border-ash-border bg-ash-body/50 text-xs font-medium uppercase tracking-wide text-ash-muted">
                    <tr>
                      <th className="px-4 py-3">What you picked</th>
                      <th className="px-4 py-3 text-right">Points</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ash-border">
                    {data.rules.map((row) => (
                      <tr
                        key={`${row.predictionKind}:${row.bonusKey ?? ""}`}
                      >
                        <td className="px-4 py-3 text-ash-text">
                          {row.label}
                        </td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums text-ash-text">
                          {formatPoolPoints(row.points)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="mt-4 text-sm text-ash-muted">
              Point values for knockout picks and bonus questions will show
              here once the host publishes them.
            </p>
          )}
        </section>

        <p className="text-sm font-normal leading-relaxed text-ash-muted">
          Standings rank everyone by total points. If there is a tie, the
          organizer decides any tie-breakers (for example picks submitted
          earliest).
        </p>
      </div>

      <p className="text-sm text-ash-muted">
        <Link href="/" className="ash-link">
          ← Back to standings
        </Link>
      </p>
    </PageContainer>
  );
}
