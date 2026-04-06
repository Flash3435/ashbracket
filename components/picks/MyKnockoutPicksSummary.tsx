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
  lockHint,
  showSavedBanner,
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

  const filledCount = slots.filter((s) => s.teamId.trim() !== "").length;

  const editHref = `/account/picks?participant=${participantId}`;

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
                Open — you can edit picks
              </span>
            )}
            <span className="text-xs text-ash-muted">
              {filledCount} of {slots.length} slots filled
            </span>
          </div>
          {lockHint ? (
            <p className="mt-2 text-sm text-amber-100">{lockHint}</p>
          ) : null}
        </div>
        <Link href={editHref} className="btn-primary inline-flex shrink-0">
          {locked ? "View edit screen" : "Edit picks"}
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <StageBlock
          title="Group stage"
          subtitle="First and second in each letter group"
          rows={group}
          teamById={teamById}
        />
        <StageBlock
          title="Third-place qualifiers"
          subtitle="Eight teams advancing from third place"
          rows={third}
          teamById={teamById}
        />
        <StageBlock
          title="Round of 32"
          subtitle="All 32 teams you expect in this round"
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
          subtitle="Your predicted finalists"
          rows={fin}
          teamById={teamById}
        />
        <StageBlock
          title="Champion"
          subtitle="Tournament winner"
          rows={champ}
          teamById={teamById}
        />
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
