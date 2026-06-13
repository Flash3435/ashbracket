import Link from "next/link";
import { KickoffTimeDisplay } from "@/components/datetime/KickoffTimeDisplay";
import { ScheduleMatchPickTeams } from "@/components/tournament/ScheduleMatchPickTeams";
import type {
  ParticipantLatestRecap,
  ParticipantRecapMatchItem,
  RecapImpact,
} from "@/lib/dashboard/buildParticipantLatestRecap";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { Team } from "../../src/types/domain";

type Props = {
  recap: ParticipantLatestRecap;
  activityHref: string;
  scheduleHref?: string;
  initialSlots?: KnockoutPickSlotDraft[];
  teams?: Team[];
};

function impactBadgeClass(impact: RecapImpact): string {
  switch (impact) {
    case "helped":
      return "rounded-full border border-emerald-700/50 bg-emerald-950/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200";
    case "mixed":
      return "rounded-full border border-amber-700/50 bg-amber-950/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100";
    case "hurt":
      return "rounded-full border border-red-800/50 bg-red-950/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-200";
    default:
      return "rounded-full border border-ash-border bg-ash-body/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ash-muted";
  }
}

function impactBadgeLabel(impact: RecapImpact): string {
  switch (impact) {
    case "helped":
      return "Helped";
    case "mixed":
      return "Mixed";
    case "hurt":
      return "Hurt";
    default:
      return "Neutral";
  }
}

function RecapMatchRow({
  item,
  pickContext,
}: {
  item: ParticipantRecapMatchItem;
  pickContext: { slots: KnockoutPickSlotDraft[]; teams: Team[] } | null;
}) {
  const meta = [item.stageLabel];
  if (item.groupCode) meta.push(`Group ${item.groupCode}`);

  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-ash-muted">{meta.join(" · ")}</p>
        <span className={impactBadgeClass(item.impact)}>
          {impactBadgeLabel(item.impact)}
        </span>
      </div>
      {item.kickoffAt ? (
        <KickoffTimeDisplay
          iso={item.kickoffAt}
          layout="split"
          dateClassName="mt-1 text-sm font-medium text-ash-text"
          timeClassName="text-xs text-ash-muted"
          className="mt-1 text-xs text-ash-muted"
        />
      ) : null}
      <ScheduleMatchPickTeams
        m={item.match}
        pickContext={pickContext}
        className="mt-2"
      />
      <p className="mt-2 text-sm font-semibold tabular-nums text-ash-text">
        {item.scoreLine}
      </p>
      <p className="mt-1 text-sm text-ash-text">{item.explanation}</p>
      {item.pointsEarned != null ? (
        <p className="mt-1 text-xs font-medium text-emerald-200">
          You earned +{item.pointsEarned} pts from this update.
        </p>
      ) : null}
      {item.rankMovement ? (
        <p className="mt-1 text-xs text-ash-muted">
          You moved {item.rankMovement.previousRank}
          {" → "}
          {item.rankMovement.newRank}
        </p>
      ) : null}
    </div>
  );
}

export function LatestRecapCard({
  recap,
  activityHref,
  scheduleHref = "/tournament",
  initialSlots,
  teams,
}: Props) {
  if (!recap.showCard) return null;

  const pickContext =
    initialSlots && teams && initialSlots.length > 0 && teams.length > 0
      ? { slots: initialSlots, teams }
      : null;

  return (
    <section className="rounded-xl border border-ash-border bg-ash-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-ash-text">Latest recap</h2>
          <p className="mt-0.5 text-xs text-ash-muted">
            How the latest result connects to your bracket.
          </p>
        </div>
        <Link href={activityHref} className="ash-link shrink-0 text-xs">
          Pool activity
        </Link>
      </div>

      {recap.variant === "compact_neutral" ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-ash-text">
            Latest scores are in, but none directly affect your bracket yet.
          </p>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href={scheduleHref} className="ash-link">
              Full schedule
            </Link>
            <Link href={activityHref} className="ash-link">
              Activity feed
            </Link>
          </div>
        </div>
      ) : recap.items[0] ? (
        <div className="mt-3">
          <RecapMatchRow item={recap.items[0]} pickContext={pickContext} />
          <Link href={activityHref} className="ash-link mt-3 inline-block text-sm">
            View activity
          </Link>
        </div>
      ) : null}
    </section>
  );
}
