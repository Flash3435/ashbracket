import Link from "next/link";
import { formatPoolPoints } from "@/lib/format/poolPoints";
import {
  buildPublicParticipantPresentation,
  type PublicParticipantDisplayPick,
  type PublicParticipantDisplaySection,
} from "../../lib/participant/publicParticipantPresentation";
import {
  CountryFlagIcon,
  CountryFlagPlaceholder,
} from "../tournament/Flag";
import type { ViewerLeaderComparison } from "@/lib/leaderboard/buildViewerLeaderComparison";
import { ViewerLeaderComparisonSummary } from "../leaderboard/ViewerLeaderComparisonSummary";
import { ViewerYouChip } from "../ui/ViewerYouChip";
import type { PublicParticipantDetail } from "../../types/publicParticipant";

function emptyBox(message: string, hint: string) {
  return (
    <div className="ash-surface px-4 py-8 text-center">
      <p className="text-sm font-medium text-ash-text">{message}</p>
      <p className="mt-2 text-sm text-ash-muted">{hint}</p>
    </div>
  );
}

function heroStat(label: string, value: string, tone: "default" | "accent" = "default") {
  return (
    <div className="rounded-2xl border border-ash-border/70 bg-ash-body/35 px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ash-muted">
        {label}
      </p>
      <p
        className={`mt-2 text-2xl font-bold tracking-tight tabular-nums ${
          tone === "accent" ? "text-emerald-200" : "text-ash-text"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function summaryCard(label: string, value: string, hint: string) {
  return (
    <div className="rounded-xl border border-ash-border/70 bg-ash-body/25 px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ash-muted">
        {label}
      </p>
      <p className="mt-2 text-xl font-semibold tabular-nums text-ash-text">{value}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-ash-muted">{hint}</p>
    </div>
  );
}

function pickStateBadge(pick: PublicParticipantDisplayPick) {
  const { status } = pick;
  const base =
    "inline-flex max-w-[11rem] rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide";

  if (status.state === "scored") {
    return (
      <span
        className={`${base} border border-emerald-500/40 bg-emerald-950/40 text-emerald-100`}
        title={status.meaning}
      >
        {status.label}
      </span>
    );
  }
  if (status.state === "awaiting") {
    return (
      <span
        className={`${base} border border-amber-600/35 bg-amber-950/35 text-amber-100`}
        title={status.meaning}
      >
        {status.label}
      </span>
    );
  }
  return (
    <span
      className={`${base} border border-slate-500/35 bg-slate-900/50 text-slate-400`}
      title={status.meaning}
    >
      {status.label}
    </span>
  );
}

function pickTeamRow(pick: PublicParticipantDisplayPick) {
  if (pick.state === "empty") {
    return (
      <div className="mt-4 flex items-center gap-3">
        <CountryFlagPlaceholder size="md" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ash-text">No pick saved</p>
          <p className="text-xs text-ash-muted">This slot was left blank.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 flex items-center gap-3">
      {pick.teamCountryCode ? (
        <CountryFlagIcon
          countryCode={pick.teamCountryCode}
          size="md"
          title={pick.teamCountryCode}
        />
      ) : (
        <CountryFlagPlaceholder size="md" />
      )}
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ash-text">{pick.teamName}</p>
        <p className="text-xs text-ash-muted">
          {pick.teamCountryCode ?? "Country code unavailable"}
        </p>
      </div>
    </div>
  );
}

function sectionSummaryLine(section: PublicParticipantDisplaySection): string {
  const parts = [`${section.picks.length} picks`];
  if (section.scoredPicksCount > 0) {
    parts.push(
      `${section.scoredPicksCount} scored`,
    );
  }
  if (section.awaitingScoreCount > 0) {
    parts.push(`${section.awaitingScoreCount} awaiting score`);
  }
  if (section.emptyPicksCount > 0) {
    parts.push(`${section.emptyPicksCount} empty`);
  }
  return parts.join(" · ");
}

function StageSection({
  section,
  defaultOpen,
}: {
  section: PublicParticipantDisplaySection;
  defaultOpen: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="group ash-surface overflow-hidden"
    >
      <summary className="cursor-pointer list-none border-b border-ash-border/70 px-5 py-4 sm:px-6 [&::-webkit-details-marker]:hidden">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className="text-ash-muted transition group-open:rotate-90"
                aria-hidden
              >
                ▸
              </span>
              <h3 className="text-lg font-semibold text-ash-text">{section.title}</h3>
            </div>
            <p className="mt-1 pl-5 text-sm leading-relaxed text-ash-muted">
              {section.description}
            </p>
            <p className="mt-2 pl-5 text-xs text-ash-border-hover">
              {sectionSummaryLine(section)}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 pl-5 lg:pl-0">
            {section.scoredPicksCount > 0 ? (
              <span className="rounded-full border border-emerald-500/30 bg-emerald-950/20 px-2.5 py-1 text-xs font-medium text-emerald-100">
                {section.scoredPicksCount} scored
              </span>
            ) : null}
            {section.awaitingScoreCount > 0 ? (
              <span className="rounded-full border border-amber-600/30 bg-amber-950/25 px-2.5 py-1 text-xs font-medium text-amber-100">
                {section.awaitingScoreCount} awaiting
              </span>
            ) : null}
            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums ${
                section.totalPoints > 0
                  ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-100"
                  : "border-ash-border/70 bg-ash-body/35 text-ash-muted"
              }`}
            >
              {formatPoolPoints(section.totalPoints)} pts
            </span>
          </div>
        </div>
      </summary>

      <div className="grid gap-3 border-t border-ash-border/40 p-4 sm:p-5 md:grid-cols-2 xl:grid-cols-3">
        {section.picks.map((pick) => (
          <article
            key={pick.predictionId}
            className="rounded-xl border border-ash-border/70 bg-ash-body/25 px-4 py-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ash-muted">
                  {pick.displayLabel}
                </p>
                {pick.detailLabel ? (
                  <p className="mt-1 text-xs text-ash-border-hover">{pick.detailLabel}</p>
                ) : null}
              </div>
              {pickStateBadge(pick)}
            </div>

            {pickTeamRow(pick)}

            <div className="mt-4 flex items-center justify-between gap-3 border-t border-ash-border/50 pt-3 text-xs">
              <span className="text-ash-muted">
                {pick.state === "scored"
                  ? pick.ledgerCount === 1
                    ? "1 point award"
                    : `${pick.ledgerCount} point awards`
                  : pick.state === "awaiting"
                    ? "Not on the scoreboard yet"
                    : "—"}
              </span>
              {pick.pointsEarned > 0 ? (
                <span className="text-base font-bold tabular-nums text-emerald-200">
                  +{formatPoolPoints(pick.pointsEarned)}
                </span>
              ) : (
                <span className="text-ash-border-hover">—</span>
              )}
            </div>
          </article>
        ))}
      </div>
    </details>
  );
}

type Props = {
  detail: PublicParticipantDetail;
  /** True when the signed-in viewer owns this participant entry in the pool. */
  isViewer?: boolean;
  /** Set when the viewer is viewing their own entry and pool standings are available. */
  viewerLeaderComparison?: ViewerLeaderComparison | null;
};

export function PublicParticipantProfile({
  detail,
  isViewer = false,
  viewerLeaderComparison = null,
}: Props) {
  const { summary, sections, ledgerItems } = buildPublicParticipantPresentation(detail);

  const unresolvedHint =
    summary.awaitingScoreCount > 0
      ? `${summary.awaitingScoreCount} saved ${summary.awaitingScoreCount === 1 ? "pick is" : "picks are"} still waiting to appear on the scoreboard.`
      : summary.scoredPicksCount === summary.totalPicks && summary.totalPicks > 0
        ? "Every saved pick slot has scored so far."
        : null;

  return (
    <div className="space-y-8 sm:space-y-10">
      <section className="ash-surface relative overflow-hidden px-5 py-5 sm:px-6 sm:py-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(22,163,74,0.16),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.04),transparent_65%)]" />
        <div className="relative space-y-6">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-ash-border/70 bg-ash-body/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-ash-muted">
              Scoring profile
            </span>
            {isViewer ? <ViewerYouChip className="px-3 py-1 text-[11px] tracking-[0.18em]" /> : null}
            <span className="rounded-full border border-ash-border/70 bg-ash-body/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-ash-muted">
              {detail.poolName}
            </span>
          </div>

          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-medium text-ash-muted">
                {isViewer ? "Your entry" : "Participant"}
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-ash-text sm:text-4xl">
                {detail.displayName}
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-ash-muted sm:text-base">
                {isViewer
                  ? "See which of your picks have scored, which are still waiting on results, and how your total was built — updated when the pool recalculates from official results."
                  : "See which picks have scored, which are still waiting on results, and how this total was built — updated when the pool recalculates from official results."}
              </p>
              {unresolvedHint ? (
                <p className="mt-2 text-sm text-amber-100/90">{unresolvedHint}</p>
              ) : null}
              {isViewer && viewerLeaderComparison ? (
                <div className="mt-4 max-w-3xl">
                  <ViewerLeaderComparisonSummary comparison={viewerLeaderComparison} />
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-3">
                <Link href={`/pool/${detail.poolId}`} className="ash-link text-sm">
                  ← Back to standings
                </Link>
                <Link
                  href={`/participant/${detail.participantId}/snapshot`}
                  className="rounded-lg border border-ash-border bg-ash-body/50 px-3 py-1.5 text-sm font-medium text-ash-text transition-colors hover:bg-ash-surface"
                >
                  Bracket snapshot
                </Link>
              </div>
            </div>

            <div className="grid w-full gap-3 sm:grid-cols-2 xl:max-w-xl">
              {heroStat("Total points", formatPoolPoints(detail.totalPoints), "accent")}
              {heroStat("Pool rank", `#${detail.rank}`)}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCard(
          "Picks scored",
          `${summary.scoredPicksCount} of ${summary.totalPicks}`,
          "Picks that have earned at least one point award on the board.",
        )}
        {summaryCard(
          "Awaiting score",
          String(summary.awaitingScoreCount),
          "Saved picks with no points yet — results may still be pending, or the pick may not score.",
        )}
        {summaryCard(
          "Stages with points",
          summary.totalStagesCount > 0
            ? `${summary.stagesWithPointsCount} of ${summary.totalStagesCount}`
            : "—",
          "How many pick stages (group, third-place, knockout, bonus) are already contributing points.",
        )}
        {summaryCard(
          "Point awards",
          String(summary.pointAwardsCount),
          isViewer
            ? "Individual times points were added to your running total."
            : "Individual times points were added to this running total.",
        )}
      </section>

      <section className="space-y-4 border-t border-ash-border/50 pt-2">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ash-muted">
            {isViewer ? "Your picks" : "Picks"}
          </p>
          <h2 className="text-2xl font-bold tracking-tight text-ash-text">
            {isViewer ? "Your picks by stage" : "Picks by stage"}
          </h2>
          <p className="max-w-3xl text-sm leading-relaxed text-ash-muted">
            Expand a stage to review each slot. Status badges reflect what we can see
            from {isViewer ? "your" : "these"} saved picks and awarded points — we
            cannot show whether an unscored pick is still waiting on results or has
            already missed.
          </p>
        </div>

        <div className="rounded-xl border border-ash-border/60 bg-ash-body/20 px-4 py-3 text-sm leading-relaxed text-ash-muted">
          <p>
            <span className="font-medium text-ash-text">Scored</span> — points are on
            the board for this pick.
          </p>
          <p className="mt-1.5">
            <span className="font-medium text-amber-100">Awaiting score</span> —{" "}
            {isViewer ? "you picked" : "they picked"} a team, but no points yet
            (pending results or no points earned).
          </p>
          <p className="mt-1.5">
            <span className="font-medium text-slate-300">No pick</span> — empty slot.
          </p>
        </div>

        {sections.length === 0 ? (
          emptyBox(
            "No picks on file",
            "Picks will appear here once they are entered for this pool.",
          )
        ) : (
          <div className="space-y-4">
            {sections.map((section, index) => (
              <StageSection
                key={section.key}
                section={section}
                defaultOpen={index < 2}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4 border-t border-ash-border/50 pt-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ash-muted">
              {isViewer ? "How your total was built" : "How this total was built"}
            </p>
            <h2 className="text-2xl font-bold tracking-tight text-ash-text">
              Points history
            </h2>
            <p className="max-w-3xl text-sm leading-relaxed text-ash-muted">
              Newest awards first. Each line is one addition to{" "}
              {isViewer ? "your" : "this participant's"} score from an official result.
            </p>
          </div>
          {ledgerItems.length > 0 ? (
            <p className="text-sm font-semibold tabular-nums text-emerald-200">
              {formatPoolPoints(summary.totalPointsFromLedger)} total from{" "}
              {summary.pointAwardsCount}{" "}
              {summary.pointAwardsCount === 1 ? "award" : "awards"}
            </p>
          ) : null}
        </div>

        {ledgerItems.length === 0 ? (
          emptyBox(
            "No points recorded yet",
            "Awards appear here after results are saved and the pool score is recalculated.",
          )
        ) : (
          <details open className="ash-surface overflow-hidden">
            <summary className="cursor-pointer list-none border-b border-ash-border/70 px-4 py-3 text-sm font-medium text-ash-text sm:px-5 [&::-webkit-details-marker]:hidden">
              Point awards ({ledgerItems.length}) — tap to collapse
            </summary>
            <ol className="divide-y divide-ash-border/50">
              {ledgerItems.map((row, index) => (
                <li key={row.id} className="px-4 py-3.5 sm:px-5 sm:py-4">
                  <div className="flex gap-3 sm:gap-4">
                    <span
                      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-ash-border/70 bg-ash-body/40 text-xs font-semibold tabular-nums text-ash-muted"
                      aria-hidden
                    >
                      {ledgerItems.length - index}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {row.stageLabel ? (
                            <span className="rounded-md border border-ash-border/60 bg-ash-body/35 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ash-muted">
                              {row.stageLabel}
                            </span>
                          ) : null}
                          {row.dateLabel ? (
                            <span className="text-xs text-ash-border-hover">
                              {row.dateLabel}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1.5 text-sm font-semibold leading-snug text-ash-text sm:text-base">
                          {row.title}
                        </p>
                        {row.detail ? (
                          <p className="mt-0.5 text-sm text-ash-muted">{row.detail}</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center sm:pt-1">
                        <span className="text-lg font-bold tabular-nums text-emerald-200 sm:text-xl">
                          {row.pointsLabel}
                          <span className="ml-1 text-sm font-semibold text-emerald-200/80">
                            pts
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </details>
        )}
      </section>
    </div>
  );
}
