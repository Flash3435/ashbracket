import Link from "next/link";
import {
  fifaRankSnapshotTitle,
  teamPickMetaLine,
} from "../../lib/teams/fifaRankDisplay";
import { CountryFlagIcon, CountryFlagPlaceholder } from "../tournament/Flag";
import {
  strengthLabelHint,
  teamStrengthLabel,
} from "../../lib/teams/teamStrengthLabel";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { Team } from "../../src/types/domain";
import { isKnockoutProgressionKind } from "../../lib/predictions/knockoutProgressionKinds";
import {
  buildPicksProgressSummary,
  buildPoolMembershipCompletionStatus,
  formatIncompleteSavedBanner,
  type PickSectionProgress,
  type PickSectionStatus,
} from "../../lib/picks/picksProgressSummary";
import { buildPoolPickDeadlineStatus } from "../../lib/picks/poolPickDeadlineDisplay";
import {
  SEMI_FINAL_WINNER_SECTION_SUBTITLE,
  SEMI_FINAL_WINNER_SECTION_TITLE,
} from "../../lib/bracket/knockoutBracketDisplayCopy";
import { buildKnockoutBracketGradualSectionNote } from "../../lib/picks/knockoutSelectionWindow";
import { PicksProgressSummaryPanel } from "./PicksProgressSummaryPanel";
import { PoolPickDeadlineBanner } from "./PoolPickDeadlineBanner";

type StageBlockProps = {
  title: string;
  subtitle: string;
  rows: KnockoutPickSlotDraft[];
  teamById: Map<string, Team>;
  section?: PickSectionProgress;
};

const SECTION_STATUS_LABEL: Record<PickSectionStatus, string> = {
  complete: "Complete",
  caught_up: "Complete for now",
  partial: "In progress",
  not_started: "Not started",
  locked: "Opens later",
};

function sectionStatusClass(status: PickSectionStatus): string {
  switch (status) {
    case "complete":
    case "caught_up":
      return "border-ash-accent/40 bg-ash-accent/10 text-ash-accent";
    case "partial":
      return "border-amber-700/45 bg-amber-950/30 text-amber-100";
    case "not_started":
      return "border-ash-border bg-ash-body/30 text-ash-muted";
    case "locked":
      return "border-sky-800/45 bg-sky-950/25 text-sky-100";
  }
}

function StageBlock({ title, subtitle, rows, teamById, section }: StageBlockProps) {
  const missingCount = rows.filter((r) => !r.teamId.trim()).length;

  return (
    <section className="ash-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-ash-text">{title}</h2>
          <p className="mt-1 text-xs text-ash-muted">{subtitle}</p>
        </div>
        {section ? (
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${sectionStatusClass(section.status)}`}
          >
            {SECTION_STATUS_LABEL[section.status]}
          </span>
        ) : null}
      </div>
      {section?.status === "partial" && section.missing > 0 ? (
        <p className="mt-2 text-xs font-medium text-amber-100/90">
          {section.missing} pick{section.missing === 1 ? "" : "s"} missing
        </p>
      ) : null}
      <ul className="mt-3 space-y-2">
        {rows.map((row) => {
          const tid = row.teamId.trim();
          const team = tid ? teamById.get(tid) : undefined;
          const isEmpty = !tid;
          const strength = team
            ? teamStrengthLabel(team.countryCode)
            : null;
          const lineLabel =
            row.predictionKind === "group_winner" ||
            row.predictionKind === "group_runner_up"
              ? `${row.sectionLabel} — ${row.slotLabel}`
              : row.slotLabel;
          return (
            <li
              key={row.rowKey}
              className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                isEmpty
                  ? "border-dashed border-amber-700/35 bg-amber-950/10"
                  : "border-ash-border bg-ash-body/40"
              }`}
            >
              {team ? (
                <CountryFlagIcon countryCode={team.countryCode} size="md" />
              ) : (
                <CountryFlagPlaceholder size="md" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-ash-muted">
                  {lineLabel}
                </p>
                <p
                  className={`font-medium ${
                    isEmpty ? "text-amber-100/90" : "text-ash-text"
                  }`}
                >
                  {team?.name ?? (tid ? "Unknown team" : "Not picked")}
                </p>
                {team && strength ? (
                  <p
                    className="text-xs text-ash-muted"
                    title={
                      [
                        fifaRankSnapshotTitle(team),
                        strengthLabelHint(strength),
                      ]
                        .filter(Boolean)
                        .join(" ") || undefined
                    }
                  >
                    {teamPickMetaLine(team, strength)}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {missingCount > 0 && !section ? (
        <p className="mt-2 text-xs text-ash-muted">
          {missingCount} empty slot{missingCount === 1 ? "" : "s"}
        </p>
      ) : null}
    </section>
  );
}

type Props = {
  slots: KnockoutPickSlotDraft[];
  teams: Team[];
  participantId: string;
  poolName: string;
  locked: boolean;
  /** Pool pick deadline (ISO). Preferred over `lockHint`. */
  lockAtIso?: string | null;
  /** @deprecated Prefer `lockAtIso`. */
  lockHint?: string | null;
  showSavedBanner: boolean;
  knockoutBracketPicksUnlocked?: boolean;
  /** One-line progress by stage (group, third-place, knockout, bonus). */
  showCompactStageProgress?: boolean;
  /** When true, hide edit CTA and use neutral copy (another participant’s bracket). */
  readOnly?: boolean;
  tournamentMatches?: import("../../types/tournamentPublic").TournamentMatchPublicRow[] | null;
  /**
   * `toolbar_only` renders the banner (when enabled) and pool / lock / edit header only — used
   * with Bracket View so list grids stay hidden.
   */
  sections?: "all" | "toolbar_only";
};

function sortGroupRows(rows: KnockoutPickSlotDraft[]): KnockoutPickSlotDraft[] {
  return [...rows].sort((a, b) => {
    const ga = a.groupCode ?? "";
    const gb = b.groupCode ?? "";
    if (ga !== gb) return ga.localeCompare(gb);
    if (a.predictionKind === b.predictionKind) return 0;
    return a.predictionKind === "group_winner" ? -1 : 1;
  });
}

export function MyKnockoutPicksSummary({
  slots,
  teams,
  participantId,
  poolName,
  locked,
  lockAtIso,
  lockHint = null,
  showSavedBanner,
  knockoutBracketPicksUnlocked = true,
  showCompactStageProgress = false,
  readOnly = false,
  sections = "all",
  tournamentMatches = null,
}: Props) {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const group = sortGroupRows(
    slots.filter(
      (s) =>
        s.predictionKind === "group_winner" ||
        s.predictionKind === "group_runner_up",
    ),
  );
  const third = slots.filter((s) => s.predictionKind === "third_place_qualifier");
  const r32 = slots.filter((s) => s.predictionKind === "round_of_32");
  const r16 = slots.filter((s) => s.predictionKind === "round_of_16");
  const qf = slots.filter((s) => s.predictionKind === "quarterfinalist");
  const sf = slots.filter((s) => s.predictionKind === "semifinalist");
  const fin = slots.filter((s) => s.predictionKind === "finalist");
  const champ = slots.filter((s) => s.predictionKind === "champion");
  const bonus = slots.filter((s) => s.predictionKind === "bonus_pick");
  const knockoutRows = [...r32, ...r16, ...qf, ...sf, ...fin, ...champ];

  const filledCount = slots.filter((s) => s.teamId.trim() !== "").length;
  const hasLegacyKnockoutPicks = slots.some(
    (s) => isKnockoutProgressionKind(s.predictionKind) && s.teamId.trim(),
  );

  const editHref = `/account/picks?participant=${participantId}`;
  const showEditButton = !readOnly;

  const picksProgress = buildPicksProgressSummary(slots, {
    knockoutBracketPicksUnlocked,
    preKnockoutLocked: locked,
    teams,
    tournamentMatches,
    officialRoundOf32Complete: knockoutBracketPicksUnlocked,
  });
  const deadlineStatus =
    lockAtIso !== undefined
      ? buildPoolPickDeadlineStatus({
          lockAtIso,
          knockoutBracketPicksUnlocked,
          readOnly,
        })
      : null;
  const sectionById = new Map(
    picksProgress.sections.map((s) => [s.id, s]),
  );

  return (
    <div className="space-y-6">
      {showSavedBanner ? (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            picksProgress.picksComplete
              ? "border-ash-accent/40 bg-ash-accent/10 text-ash-muted"
              : "border-amber-700/50 bg-amber-950/30 text-amber-100"
          }`}
          role="status"
        >
          <p className="font-semibold text-ash-text">
            {picksProgress.picksComplete
              ? "You’re all set — required picks complete."
              : formatIncompleteSavedBanner(
                  buildPoolMembershipCompletionStatus(slots, {
                    knockoutBracketPicksUnlocked,
                    teams,
                    tournamentMatches,
                    officialRoundOf32Complete: knockoutBracketPicksUnlocked,
                  }),
                )}
          </p>
          {picksProgress.picksComplete ? (
            <p className="mt-1 text-ash-muted">
              Snapshot of your full tournament picks.
              {locked
                ? " Group & bonus picks are locked — this is a read-only summary."
                : " You can still edit until the pick deadline."}
            </p>
          ) : (
            <p className="mt-1 text-amber-100/90">
              {
                buildPoolMembershipCompletionStatus(slots, {
                  knockoutBracketPicksUnlocked,
                }).displaySummary
              }
            </p>
          )}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-sm text-ash-muted">
            Pool:{" "}
            <span className="font-medium text-ash-text">{poolName}</span>
            <span className="ml-2 text-xs text-ash-muted">
              {filledCount} of {slots.length} slots filled
            </span>
          </p>
          {deadlineStatus ? (
            <PoolPickDeadlineBanner status={deadlineStatus} />
          ) : lockHint ? (
            <p className="text-sm text-amber-100">{lockHint}</p>
          ) : null}
          {showCompactStageProgress ? (
            <PicksProgressSummaryPanel summary={picksProgress} />
          ) : null}
          {showCompactStageProgress &&
          showEditButton &&
          picksProgress.nextSection &&
          !picksProgress.waitingForR32 &&
          (!locked || picksProgress.nextSection.sectionId === "knockout") ? (
            <Link
              href={editHref}
              className="inline-flex rounded-lg bg-ash-accent px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-ash-accent/90"
            >
              {picksProgress.nextSection.ctaLabel}
            </Link>
          ) : null}
        </div>
        {showEditButton ? (
          <Link href={editHref} className="btn-primary inline-flex shrink-0">
            {locked
              ? knockoutBracketPicksUnlocked &&
                  picksProgress.actionableMissingCount > 0
                ? "Edit knockout picks"
                : "View picks"
              : "Edit picks"}
          </Link>
        ) : null}
      </div>

      {sections === "toolbar_only" ? null : (
      <div className="grid gap-4 lg:grid-cols-2">
        <StageBlock
          title="Group stage"
          subtitle="First and second in each letter group"
          rows={group}
          teamById={teamById}
          section={sectionById.get("group")}
        />
        <StageBlock
          title="Stage 2 — third-place qualification"
          subtitle="One third-place team per group row (eight groups total). These are qualification picks — FIFA assigns bracket slots later, not here."
          rows={third}
          teamById={teamById}
          section={sectionById.get("third_place")}
        />
        {knockoutBracketPicksUnlocked ? (
          <>
            <StageBlock
              title="Round of 32"
              subtitle="All 32 teams in their official slots"
              rows={r32}
              teamById={teamById}
            />
            <StageBlock
              title="Round of 16"
              subtitle="Sixteen teams in the second knockout round"
              rows={r16}
              teamById={teamById}
            />
            <StageBlock
              title="Quarter-finalists"
              subtitle="Last eight"
              rows={qf}
              teamById={teamById}
            />
            <StageBlock
              title="Semi-finalists"
              subtitle="Four teams in the semis"
              rows={sf}
              teamById={teamById}
            />
            <StageBlock
              title={SEMI_FINAL_WINNER_SECTION_TITLE}
              subtitle={
                readOnly
                  ? "Semi-final winners they picked"
                  : SEMI_FINAL_WINNER_SECTION_SUBTITLE
              }
              rows={fin}
              teamById={teamById}
            />
            <StageBlock
              title="Champion"
              subtitle="Tournament winner"
              rows={champ}
              teamById={teamById}
            />
          </>
        ) : (
          <section className="ash-surface p-4 lg:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-ash-text">
                  Knockout bracket (Round of 32 → champion)
                </h2>
                <p className="mt-1 text-xs text-ash-muted">
                  {buildKnockoutBracketGradualSectionNote(readOnly)}
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-sky-800/45 bg-sky-950/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-100">
                Opens later
              </span>
            </div>
            {hasLegacyKnockoutPicks ? (
              <p className="mt-3 text-xs text-amber-100">
                Older saved knockout rows are still on file but stay frozen until
                the bracket unlocks; they are not shown here to avoid looking
                like a finished draw.
              </p>
            ) : null}
          </section>
        )}
        <StageBlock
          title="Bonus picks"
          subtitle="Extra tournament-wide questions"
          rows={bonus}
          teamById={teamById}
          section={sectionById.get("bonus")}
        />
      </div>
      )}
    </div>
  );
}
