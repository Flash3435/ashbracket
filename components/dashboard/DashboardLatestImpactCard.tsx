import Link from "next/link";
import {
  formatRecapMatchHeadline,
  recapBadgeKind,
  type ParticipantLatestRecap,
  type ParticipantRecapMatchItem,
  type RecapBadgeKind,
} from "@/lib/dashboard/buildParticipantLatestRecap";

type Props = {
  recap: ParticipantLatestRecap;
  activityHref: string;
  scheduleHref?: string;
};

function impactBadgeClass(kind: RecapBadgeKind): string {
  switch (kind) {
    case "helped":
      return "rounded-full border border-emerald-700/50 bg-emerald-950/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200";
    case "mixed":
      return "rounded-full border border-amber-700/50 bg-amber-950/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100";
    case "hurt":
      return "rounded-full border border-red-800/50 bg-red-950/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-200";
    case "no_scoring_yet":
      return "rounded-full border border-sky-800/50 bg-sky-950/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-200";
    default:
      return "rounded-full border border-ash-border bg-ash-body/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ash-muted";
  }
}

function impactBadgeLabel(kind: RecapBadgeKind): string {
  switch (kind) {
    case "helped":
      return "Helped";
    case "mixed":
      return "Mixed";
    case "hurt":
      return "Hurt";
    case "no_scoring_yet":
      return "No scoring yet";
    default:
      return "No bracket impact";
  }
}

function RecapMatchRow({ item }: { item: ParticipantRecapMatchItem }) {
  const badge = recapBadgeKind(item);

  return (
    <li className="border-b border-ash-border/60 py-2.5 last:border-b-0 last:pb-0 first:pt-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-semibold text-ash-text">
          {formatRecapMatchHeadline(item.match)}
        </p>
        <span className={impactBadgeClass(badge)}>{impactBadgeLabel(badge)}</span>
      </div>
      <p className="mt-1 text-xs leading-snug text-ash-muted">{item.explanation}</p>
      {item.pointsEarned != null ? (
        <p className="mt-1 text-xs font-medium text-emerald-200">
          +{item.pointsEarned} pts from this update
        </p>
      ) : null}
    </li>
  );
}

export function DashboardLatestImpactCard({
  recap,
  activityHref,
  scheduleHref = "/tournament",
}: Props) {
  if (!recap.showCard || recap.items.length === 0) return null;

  return (
    <section className="rounded-xl border border-ash-border bg-ash-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-ash-text">Latest scores impact</h2>
          <p className="mt-0.5 text-xs text-ash-muted">
            {recap.matchDaySubtitle ?? "How recent results affected your bracket."}
          </p>
        </div>
        <Link href={activityHref} className="ash-link shrink-0 text-xs">
          View activity
        </Link>
      </div>

      <ul className="mt-3">
        {recap.items.map((item) => (
          <RecapMatchRow key={item.matchId} item={item} />
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap gap-3 text-xs">
        <Link href={activityHref} className="ash-link">
          View activity
        </Link>
        <Link href={scheduleHref} className="ash-link text-ash-muted">
          Full schedule
        </Link>
      </div>
    </section>
  );
}
