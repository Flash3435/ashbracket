import Link from "next/link";
import { formatPoolPoints } from "@/lib/format/poolPoints";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { bonusRulesTableRowsFromPublicRules } from "../../lib/rules/bonusRulesTableRows";
import { fetchSamplePoolScoringRules } from "../../lib/rules/fetchSamplePoolScoringRules";
import { knockoutRulesTableRowsFromPublicRules } from "../../lib/rules/knockoutRulesTableRows";
import { partitionPublicRulesForDisplay } from "../../lib/rules/partitionPublicRulesForDisplay";
import {
  DEFAULT_PUBLIC_RULES_STAGE2_CORRECT,
  PUBLIC_RULES_DEFAULT_TIE_BREAK,
  PUBLIC_RULES_PAGE_COPY,
  describePrizeTier,
} from "../../lib/rules/publicRulesDisplayDefaults";
import { comparePublicScoringRuleRows } from "../../lib/rules/comparePublicScoringRules";
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
  const sorted = [...rows].sort(comparePublicScoringRuleRows);
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
          {sorted.map((row) => (
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

function PointsLabelTable({
  rows,
  leftHeading,
}: {
  rows: { key: string; label: string; points: number }[];
  leftHeading: string;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-3 overflow-x-auto rounded-md border border-ash-border">
      <table className="w-full min-w-[320px] text-left text-sm">
        <thead className="border-b border-ash-border bg-ash-body/50 text-xs font-medium uppercase tracking-wide text-ash-muted">
          <tr>
            <th className="px-4 py-3">{leftHeading}</th>
            <th className="px-4 py-3 text-right">Points</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ash-border">
          {rows.map((row) => (
            <tr key={row.key}>
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
            No public pool rules available yet
          </p>
          <p className="mt-2 text-sm text-ash-muted">
            The organizer has not published public rules for this pool, or they
            are still being set up. Check with the organizer if you expected to
            see them here.
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
  const { groupKindRules, knockoutRules, thirdPlaceRules, bonusRules } =
    partitionPublicRulesForDisplay(data.rules);
  const tieCopy = data.tieBreakNote?.trim() || PUBLIC_RULES_DEFAULT_TIE_BREAK;

  const knockoutTableRows =
    knockoutRulesTableRowsFromPublicRules(knockoutRules);
  const bonusTableRows = bonusRulesTableRowsFromPublicRules(bonusRules);

  const stage2PointsPerCorrect =
    thirdPlaceRules.length > 0
      ? Math.max(...thirdPlaceRules.map((r) => r.points))
      : DEFAULT_PUBLIC_RULES_STAGE2_CORRECT;

  const pageTitle = data.poolName.trim() || "Pool rules";
  const pageDescription = lockLabel
    ? `Pre–knockout picks lock ${lockLabel} (UTC) unless the host changes the deadline. Stage 3 opens after the official Round of 32 bracket is published.`
    : "Three stages — group finishes, best third-place advancers, then the published knockout bracket — plus bonus picks.";

  const c = PUBLIC_RULES_PAGE_COPY;

  return (
    <PageContainer>
      <PageTitle title={pageTitle} description={pageDescription} />

      <div className="space-y-6">
        <section className="ash-surface px-4 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ash-muted">
            How the pool works
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ash-text">
            {c.howPoolWorksLead}
          </p>
          <ol className="mt-4 list-decimal space-y-4 pl-5 text-sm text-ash-text">
            <li>
              <p className="font-medium text-ash-text">{c.stage1Title}</p>
              <p className="mt-1 leading-relaxed text-ash-muted">
                {c.stage1Body}
              </p>
            </li>
            <li>
              <p className="font-medium text-ash-text">{c.stage2Title}</p>
              <p className="mt-1 leading-relaxed text-ash-muted">
                {c.stage2Body}
              </p>
            </li>
            <li>
              <p className="font-medium text-ash-text">{c.stage3Title}</p>
              <p className="mt-1 leading-relaxed text-ash-muted">
                {c.stage3Body}
              </p>
            </li>
          </ol>
        </section>

        <section className="ash-surface px-4 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ash-muted">
            {c.lockingTitle}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ash-text">
            {c.lockingP1}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ash-muted">
            {c.lockingP2}
          </p>
        </section>

        <section className="ash-surface px-4 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ash-muted">
            How you score points
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ash-text">
            {c.howYouScoreP1}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ash-muted">
            {c.howYouScoreP2}
          </p>
        </section>

        <section className="ash-surface px-4 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ash-muted">
            Prizes
          </h2>
          {data.prizeTiers.length > 0 ? (
            <>
              <p className="mt-2 text-sm text-ash-muted">{c.prizeIntro}</p>
              <ul className="mt-3 list-inside list-disc space-y-1.5 text-sm text-ash-text">
                {data.prizeTiers.map((tier) => (
                  <li key={tier.place}>{describePrizeTier(tier)}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-ash-muted">
              {c.prizeNotPublished}
            </p>
          )}
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
                {c.entryPerPersonNote}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-ash-muted">
              {c.entryUnknownFee}
            </p>
          )}
        </section>

        <section className="ash-surface px-4 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ash-muted">
            Stage 1 — Group stage picks
          </h2>
          {data.groupAdvance ? (
            <div className="mt-3 rounded-lg border border-ash-border bg-ash-body/40 px-3 py-3">
              <p className="text-sm text-ash-muted">
                For each group, pick which team finishes{" "}
                <span className="font-medium text-ash-text">first</span> and
                which finishes{" "}
                <span className="font-medium text-ash-text">second</span> (top
                two in the group).
              </p>
              <ul className="mt-3 list-inside list-disc space-y-1.5 text-sm text-ash-muted">
                <li>
                  <span className="font-medium text-ash-text">
                    {formatPoolPoints(data.groupAdvance.exactPoints)} points
                  </span>{" "}
                  if the team is in the{" "}
                  <span className="font-medium text-ash-text">correct</span>{" "}
                  position
                </li>
                <li>
                  <span className="font-medium text-ash-text">
                    {formatPoolPoints(data.groupAdvance.wrongSlotPoints)} points
                  </span>{" "}
                  if the team finishes in the top two but in the other qualifying
                  position than you picked
                </li>
                <li className="list-none pl-0 text-ash-muted">
                  {c.groupAdvanceZero}
                </li>
              </ul>
            </div>
          ) : groupKindRules.length > 0 ? (
            <>
              <p className="mt-2 text-sm text-ash-muted">
                {c.groupPerKindIntro}
              </p>
              <RulesPointsTable rows={groupKindRules} />
            </>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-ash-muted">
              {c.groupNoTableCopy}
            </p>
          )}
        </section>

        <section className="ash-surface px-4 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ash-muted">
            Stage 2 — Best third-place teams
          </h2>
          <div className="mt-3 rounded-lg border border-ash-border bg-ash-body/40 px-3 py-3">
            <p className="text-sm leading-relaxed text-ash-muted">
              {c.stage2ScoringIntro}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-ash-muted">
              {c.stage2ScoringFollow}
            </p>
            <ul className="mt-3 list-inside list-disc space-y-1.5 text-sm text-ash-muted">
              <li>
                <span className="font-medium text-ash-text">
                  {formatPoolPoints(stage2PointsPerCorrect)} points
                </span>{" "}
                for each correctly picked team that advances as a best third-place
                qualifier
              </li>
              <li>
                <span className="font-medium text-ash-text">0 points</span> for
                each incorrect team
              </li>
              <li className="text-ash-muted">Order does not matter.</li>
            </ul>
          </div>
        </section>

        <section className="ash-surface px-4 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ash-muted">
            Stage 3 — Knockout bracket
          </h2>
          <p className="mt-2 text-sm text-ash-muted">{c.knockoutScoringNote}</p>
          <PointsLabelTable
            rows={knockoutTableRows}
            leftHeading="Furthest round reached"
          />
        </section>

        <section className="ash-surface px-4 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ash-muted">
            Bonus picks
          </h2>
          <p className="mt-2 text-sm text-ash-muted">{c.bonusIntro}</p>
          <PointsLabelTable rows={bonusTableRows} leftHeading="Category" />
        </section>

        <section className="ash-surface px-4 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ash-muted">
            Ties
          </h2>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ash-text">
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
