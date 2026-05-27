import Link from "next/link";
import { formatPoolPoints } from "@/lib/format/poolPoints";
import {
  buildPublicParticipantPresentation,
  type PublicParticipantDisplayPick,
} from "../../lib/participant/publicParticipantPresentation";
import {
  CountryFlagIcon,
  CountryFlagPlaceholder,
} from "../tournament/Flag";
import type { PublicParticipantDetail } from "../../types/publicParticipant";

function emptyBox(message: string, hint: string) {
  return (
    <div className="ash-surface px-4 py-8 text-center">
      <p className="text-sm font-medium text-ash-text">{message}</p>
      <p className="mt-2 text-sm text-ash-muted">{hint}</p>
    </div>
  );
}

function statCard(label: string, value: string, tone: "default" | "accent" = "default") {
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
      <p className="mt-1 text-sm text-ash-muted">{hint}</p>
    </div>
  );
}

function pickStateBadge(pick: PublicParticipantDisplayPick) {
  if (pick.state === "scored") {
    return (
      <span className="inline-flex rounded-full border border-emerald-500/40 bg-emerald-950/40 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-100">
        On the board
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full border border-slate-500/35 bg-slate-900/50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-300">
      No points yet
    </span>
  );
}

function pickTeamRow(pick: PublicParticipantDisplayPick) {
  if (!pick.teamName) {
    return (
      <div className="mt-4 flex items-center gap-3">
        <CountryFlagPlaceholder size="md" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ash-text">No pick saved</p>
          <p className="text-xs text-ash-muted">This slot has not been filled yet.</p>
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
          {pick.teamCountryCode ? pick.teamCountryCode : "Country code unavailable"}
        </p>
      </div>
    </div>
  );
}

type Props = {
  detail: PublicParticipantDetail;
};

export function PublicParticipantProfile({ detail }: Props) {
  const { summary, sections, ledgerItems } = buildPublicParticipantPresentation(detail);

  return (
    <div className="space-y-8 sm:space-y-10">
      <section className="ash-surface relative overflow-hidden px-5 py-5 sm:px-6 sm:py-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(22,163,74,0.16),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.04),transparent_65%)]" />
        <div className="relative space-y-6">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-ash-border/70 bg-ash-body/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-ash-muted">
              Public participant profile
            </span>
            <span className="rounded-full border border-ash-border/70 bg-ash-body/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-ash-muted">
              {detail.poolName}
            </span>
          </div>

          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-medium text-ash-muted">Participant</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-ash-text sm:text-4xl">
                {detail.displayName}
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-ash-muted sm:text-base">
                A cleaner view of this entry&apos;s picks, points, and scoring activity.
              </p>
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
              {statCard("Total points", formatPoolPoints(detail.totalPoints), "accent")}
              {statCard("Rank", `#${detail.rank}`)}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCard(
          "Picks with points",
          `${summary.scoredPicksCount} / ${summary.totalPicks}`,
          "How many picks have already earned points.",
        )}
        {summaryCard(
          "Sections on board",
          `${summary.sectionsWithPointsCount} / ${summary.totalSectionsCount}`,
          "Stages or groups already contributing points.",
        )}
        {summaryCard(
          "Scoring categories",
          `${summary.categoriesWithPointsCount}`,
          "Different pick categories that have scored so far.",
        )}
        {summaryCard(
          "Scoring events",
          `${summary.scoringEventsCount}`,
          "Individual points entries recorded in the ledger.",
        )}
      </section>

      <section className="space-y-4">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ash-muted">
            Picks
          </p>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-ash-text">
                Picks by stage
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ash-muted">
                Grouped into the same logical stages participants use when making
                picks, with clearer labels and point callouts when an entry is
                already on the board.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-ash-border/70 bg-ash-body/25 px-4 py-3 text-sm leading-relaxed text-ash-muted">
          Public scoring only shows awarded points. A green badge means that pick
          has already earned points; cards without one may still be pending, or
          they may simply not have scored yet.
        </div>

        {sections.length === 0 ? (
          emptyBox(
            "No picks on file",
            "Picks will appear here once they are entered for this pool.",
          )
        ) : (
          <div className="space-y-6">
            {sections.map((section) => (
              <section key={section.key} className="ash-surface overflow-hidden">
                <div className="border-b border-ash-border/70 px-5 py-4 sm:px-6">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-ash-text">
                        {section.title}
                      </h3>
                      <p className="mt-1 text-sm leading-relaxed text-ash-muted">
                        {section.description}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full border border-ash-border/70 bg-ash-body/35 px-2.5 py-1 font-medium text-ash-muted">
                        {section.picks.length} picks
                      </span>
                      <span className="rounded-full border border-ash-border/70 bg-ash-body/35 px-2.5 py-1 font-medium text-ash-muted">
                        {section.scoredPicksCount} with points
                      </span>
                      <span className="rounded-full border border-emerald-500/30 bg-emerald-950/20 px-2.5 py-1 font-semibold text-emerald-100">
                        {formatPoolPoints(section.totalPoints)} pts
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 p-4 sm:p-5 md:grid-cols-2 xl:grid-cols-3">
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
                            <p className="mt-1 text-xs text-ash-border-hover">
                              {pick.detailLabel}
                            </p>
                          ) : null}
                        </div>
                        {pickStateBadge(pick)}
                      </div>

                      {pickTeamRow(pick)}

                      <div className="mt-4 flex items-center justify-between gap-3 border-t border-ash-border/50 pt-3 text-xs">
                        <span className="text-ash-muted">
                          {pick.ledgerCount > 0
                            ? `${pick.ledgerCount} scoring ${pick.ledgerCount === 1 ? "event" : "events"}`
                            : "Awaiting points"}
                        </span>
                        {pick.pointsEarned > 0 ? (
                          <span className="font-semibold tabular-nums text-emerald-200">
                            +{formatPoolPoints(pick.pointsEarned)}
                          </span>
                        ) : (
                          <span className="text-ash-border-hover">—</span>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ash-muted">
            Scoring breakdown
          </p>
          <h2 className="text-2xl font-bold tracking-tight text-ash-text">
            Points history
          </h2>
          <p className="max-w-3xl text-sm leading-relaxed text-ash-muted">
            Each entry explains where points came from, with the newest scoring
            activity shown first.
          </p>
        </div>

        {ledgerItems.length === 0 ? (
          emptyBox(
            "No points recorded yet",
            "Ledger entries appear after match results are saved and scores are recomputed.",
          )
        ) : (
          <div className="space-y-3">
            {ledgerItems.map((row) => (
              <article
                key={row.id}
                className="ash-surface px-4 py-4 sm:px-5"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ash-text sm:text-base">
                      {row.title}
                    </p>
                    {row.detail ? (
                      <p className="mt-1 text-sm text-ash-muted">{row.detail}</p>
                    ) : null}
                    <p className="mt-2 text-xs font-medium uppercase tracking-[0.14em] text-ash-border-hover">
                      {row.timestampLabel}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded-full border border-emerald-500/40 bg-emerald-950/35 px-3 py-1 text-sm font-semibold tabular-nums text-emerald-100">
                      {row.pointsLabel} pts
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
