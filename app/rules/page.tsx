import Link from "next/link";
import { formatPoolPoints } from "@/lib/format/poolPoints";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { fetchSamplePoolScoringRules } from "../../lib/rules/fetchSamplePoolScoringRules";
import { partitionPublicRulesForDisplay } from "../../lib/rules/partitionPublicRulesForDisplay";
import {
  PUBLIC_RULES_DEFAULT_TIE_BREAK,
  PUBLIC_RULES_PAGE_COPY,
  describePrizeTier,
} from "../../lib/rules/publicRulesDisplayDefaults";
import type { PublicScoringRuleRow } from "../../types/publicScoringRules";

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

function RulesPointsTable({ rows }: { rows: PublicScoringRuleRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-3 overflow-x-auto rounded-md border border-ash-border">
      <table className="w-full min-w-[320px] text-left text-sm">
        <thead className="border-b border-ash-border bg-ash-body/50 text-xs font-medium uppercase tracking-wide text-ash-muted">
          <tr>
            <th className="px-4 py-3">Pick type</th>
            <th className="px-4 py-3 text-right">Points</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ash-border">
          {rows.map((row) => (
            <tr key={`${row.predictionKind}:${row.bonusKey ?? ""}`}>
              <td className="px-4 py-3 text-ash-text">{row.label}</td>
              <td className="px-4 py-3 text-right font-medium tabular-nums text-ash-text">
                {formatPoolPoints(row.points)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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
  const { groupKindRules, knockoutRules, bonusRules } =
    partitionPublicRulesForDisplay(data.rules);
  const tieCopy = data.tieBreakNote?.trim() || PUBLIC_RULES_DEFAULT_TIE_BREAK;

  const pageTitle = data.poolName.trim() || "Pool rules";
  const pageDescription = lockLabel
    ? `Picks lock ${lockLabel} (UTC). Below: entry, prizes, and every way you can score.`
    : "Entry, prizes, and every way you can score — in plain language.";

  return (
    <PageContainer>
      <PageTitle title={pageTitle} description={pageDescription} />

      <div className="space-y-6">
        <section className="ash-surface px-4 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ash-muted">
            How you score points
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ash-text">
            {PUBLIC_RULES_PAGE_COPY.howYouScoreP1}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ash-muted">
            {PUBLIC_RULES_PAGE_COPY.howYouScoreP2}
          </p>
        </section>

        <section className="ash-surface px-4 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ash-muted">
            Entry
          </h2>
          {feeLabel ? (
            <>
              <p className="mt-2 text-lg font-medium text-ash-text">
                {feeLabel} per entry
              </p>
              <p className="mt-1 text-sm text-ash-muted">
                {PUBLIC_RULES_PAGE_COPY.entryPerPersonNote}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-ash-muted">
              {PUBLIC_RULES_PAGE_COPY.entryUnknownFee}
            </p>
          )}
        </section>

        <section className="ash-surface px-4 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ash-muted">
            Prizes
          </h2>
          {data.prizeTiers.length > 0 ? (
            <>
              <p className="mt-2 text-sm text-ash-muted">
                {PUBLIC_RULES_PAGE_COPY.prizeIntro}
              </p>
              <ul className="mt-3 list-inside list-disc space-y-1.5 text-sm text-ash-text">
                {data.prizeTiers.map((tier) => (
                  <li key={tier.place}>{describePrizeTier(tier)}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-ash-muted">
              {PUBLIC_RULES_PAGE_COPY.prizeNotPublished}
            </p>
          )}
        </section>

        <section className="ash-surface px-4 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ash-muted">
            Group-stage picks
          </h2>
          {data.groupAdvance ? (
            <div className="mt-3 rounded-lg border border-ash-border bg-ash-body/40 px-3 py-3">
              <p className="text-sm text-ash-muted">
                For each group, you pick which team finishes{" "}
                <span className="font-medium text-ash-text">first</span> and
                which finishes{" "}
                <span className="font-medium text-ash-text">second</span>{" "}
                (both teams advance).
              </p>
              <ul className="mt-3 list-inside list-disc space-y-1.5 text-sm text-ash-muted">
                <li>
                  <span className="font-medium text-ash-text">
                    {formatPoolPoints(data.groupAdvance.exactPoints)} points
                  </span>{" "}
                  if the team is in the{" "}
                  <span className="font-medium text-ash-text">right</span> slot
                  — winner where they actually place first, runner-up where they
                  actually place second.
                </li>
                <li>
                  <span className="font-medium text-ash-text">
                    {formatPoolPoints(data.groupAdvance.wrongSlotPoints)} points
                  </span>{" "}
                  if the team{" "}
                  <span className="font-medium text-ash-text">
                    still advances
                  </span>{" "}
                  but you had them in the other qualifying spot (for example you
                  picked them first and they came second, or the other way
                  around).
                </li>
                <li className="list-none pl-0 text-ash-muted">
                  No points if the team does not advance from the group.
                </li>
              </ul>
            </div>
          ) : groupKindRules.length > 0 ? (
            <>
              <p className="mt-2 text-sm text-ash-muted">
                {PUBLIC_RULES_PAGE_COPY.groupPerKindIntro}
              </p>
              <RulesPointsTable rows={groupKindRules} />
            </>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-ash-muted">
              {PUBLIC_RULES_PAGE_COPY.groupNoTableCopy}
            </p>
          )}
        </section>

        <section className="ash-surface px-4 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ash-muted">
            Knockout picks
          </h2>
          <p className="mt-2 text-sm text-ash-muted">
            {PUBLIC_RULES_PAGE_COPY.knockoutIntro}
          </p>
          {knockoutRules.length > 0 ? (
            <RulesPointsTable rows={knockoutRules} />
          ) : (
            <p className="mt-3 text-sm text-ash-muted">
              {PUBLIC_RULES_PAGE_COPY.knockoutUnpublished}
            </p>
          )}
        </section>

        <section className="ash-surface px-4 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ash-muted">
            Bonus picks
          </h2>
          <p className="mt-2 text-sm text-ash-muted">
            {PUBLIC_RULES_PAGE_COPY.bonusIntro}
          </p>
          {bonusRules.length > 0 ? (
            <RulesPointsTable rows={bonusRules} />
          ) : (
            <p className="mt-3 text-sm text-ash-muted">
              {PUBLIC_RULES_PAGE_COPY.bonusUnpublished}
            </p>
          )}
        </section>

        <section className="ash-surface px-4 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ash-muted">
            Tie-breaks
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ash-text">
            {tieCopy}
          </p>
        </section>
      </div>

      <p className="mt-8 text-sm text-ash-muted">
        <Link href="/" className="ash-link">
          ← Back to standings
        </Link>
      </p>
    </PageContainer>
  );
}
