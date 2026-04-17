import Link from "next/link";
import {
  fifaRankSnapshotTitle,
  teamPickMetaLine,
} from "../../lib/teams/fifaRankDisplay";
import { flagEmojiForFifaCountryCode } from "../../lib/teams/fifaToIso2ForFlag";
import {
  strengthLabelHint,
  teamStrengthLabel,
} from "../../lib/teams/teamStrengthLabel";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { Team } from "../../src/types/domain";
import { isKnockoutProgressionKind } from "../../lib/predictions/knockoutProgressionKinds";

type StageBlockProps = {
  title: string;
  subtitle: string;
  rows: KnockoutPickSlotDraft[];
  teamById: Map<string, Team>;
};

function StageBlock({ title, subtitle, rows, teamById }: StageBlockProps) {
  return (
    <section className="ash-surface p-4">
      <h2 className="text-base font-bold text-ash-text">{title}</h2>
      <p className="mt-1 text-xs text-ash-muted">{subtitle}</p>
      <ul className="mt-3 space-y-2">
        {rows.map((row) => {
          const tid = row.teamId.trim();
          const team = tid ? teamById.get(tid) : undefined;
          const flag = team
            ? flagEmojiForFifaCountryCode(team.countryCode)
            : "";
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
              className="flex items-center gap-2 rounded-md border border-ash-border bg-ash-body/40 px-3 py-2 text-sm"
            >
              <span className="text-xl leading-none" aria-hidden>
                {flag || "🌍"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-ash-muted">
                  {lineLabel}
                </p>
                <p className="font-medium text-ash-text">
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
    </section>
  );
}

type Props = {
  slots: KnockoutPickSlotDraft[];
  teams: Team[];
  participantId: string;
  poolName: string;
  locked: boolean;
  lockHint: string | null;
  showSavedBanner: boolean;
  knockoutBracketPicksUnlocked?: boolean;
  /** One-line progress by stage (group, third-place, knockout, bonus). */
  showCompactStageProgress?: boolean;
  /** When true, hide edit CTA and use neutral copy (another participant’s bracket). */
  readOnly?: boolean;
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

function filledOfTotal(rows: KnockoutPickSlotDraft[]): { filled: number; total: number } {
  const total = rows.length;
  const filled = rows.filter((s) => s.teamId.trim() !== "").length;
  return { filled, total };
}

export function MyKnockoutPicksSummary({
  slots,
  teams,
  participantId,
  poolName,
  locked,
  lockHint,
  showSavedBanner,
  knockoutBracketPicksUnlocked = true,
  showCompactStageProgress = false,
  readOnly = false,
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

  const groupProg = filledOfTotal(group);
  const thirdProg = filledOfTotal(third);
  const bonusProg = filledOfTotal(bonus);
  const knockoutProg = filledOfTotal(knockoutRows);
  const compactStageProgressLine = showCompactStageProgress
    ? [
        `Group stage: ${groupProg.filled} / ${groupProg.total}`,
        `Third-place advancers: ${thirdProg.filled} / ${thirdProg.total}`,
        knockoutBracketPicksUnlocked
          ? `Knockout picks: ${knockoutProg.filled} / ${knockoutProg.total}`
          : "Knockout picks: open when Round of 32 is set",
        `Bonus picks: ${bonusProg.filled} / ${bonusProg.total}`,
      ].join(" · ")
    : null;

  return (
    <div className="space-y-6">
      {showSavedBanner ? (
        <div
          className="rounded-lg border border-ash-accent/40 bg-ash-accent/10 px-4 py-3 text-sm text-ash-muted"
          role="status"
        >
          <p className="font-semibold text-ash-text">You’re all set — picks saved.</p>
          <p className="mt-1 text-ash-muted">
            Snapshot of your full tournament picks. You can still edit until the
            pool locks.
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-ash-muted">
            Pool:{" "}
            <span className="font-medium text-ash-text">{poolName}</span>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {locked ? (
              <span className="rounded-full bg-amber-950/50 px-2.5 py-0.5 text-xs font-medium text-amber-100">
                Locked — picks frozen
              </span>
            ) : (
              <span className="rounded-full bg-ash-accent/20 px-2.5 py-0.5 text-xs font-medium text-ash-accent">
                {readOnly ? "Open — picks not locked yet" : "Open — you can edit picks"}
              </span>
            )}
            <span className="text-xs text-ash-muted">
              {filledCount} of {slots.length} slots filled
            </span>
          </div>
          {compactStageProgressLine ? (
            <p className="mt-2 text-xs leading-relaxed text-ash-muted">
              <span className="text-ash-text/90">{compactStageProgressLine}</span>
            </p>
          ) : null}
          {lockHint ? (
            <p className="mt-2 text-sm text-amber-100">{lockHint}</p>
          ) : null}
        </div>
        {showEditButton ? (
          <Link href={editHref} className="btn-primary inline-flex shrink-0">
            {locked ? "View edit screen" : "Edit picks"}
          </Link>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <StageBlock
          title="Group stage"
          subtitle="First and second in each letter group"
          rows={group}
          teamById={teamById}
        />
        <StageBlock
          title="Third-place advancers"
          subtitle={
            readOnly
              ? "Eight teams they predict will qualify from third place (not their bracket slots)"
              : "Eight teams you predict will qualify from third place (not their bracket slots)"
          }
          rows={third}
          teamById={teamById}
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
              title="Finalists"
              subtitle={readOnly ? "Their predicted finalists" : "Your predicted finalists"}
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
            <h2 className="text-base font-bold text-ash-text">
              Knockout bracket (Round of 32 → champion)
            </h2>
            <p className="mt-1 text-xs text-ash-muted">
              This section opens after organizers enter the full official Round of
              32 lineup.{" "}
              {readOnly
                ? "The pool intentionally waits for real FIFA bracket slots before knockout picks and scoring."
                : "You are not missing a step — the pool intentionally waits for real FIFA bracket slots before knockout picks and scoring."}
            </p>
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
        />
      </div>
    </div>
  );
}
