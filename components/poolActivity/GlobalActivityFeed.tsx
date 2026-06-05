import Link from "next/link";
import { buildAshBotCommentsForFeed } from "@/lib/activity/ashbotCommentary";
import { formatRelativeTimeEn } from "@/lib/datetime/formatRelativeTimeEn";
import { ashDailyRecapDisplayBody } from "@/lib/poolActivity/buildDeterministicRecapBody";
import type { ActivityReactionsSnapshot } from "@/lib/poolActivity/activityReactionTypes";
import type { GlobalPoolActivityFeedRow } from "@/lib/poolActivity/globalActivityTypes";
import type { PoolInsightLabel, PoolMilestoneLabel } from "@/lib/poolActivity/poolActivityTypes";
import { AshBotCommentaryLine } from "./AshBotCommentaryLine";
import {
  ActivityReactionBar,
  reactionBarPropsForActivity,
} from "./ActivityReactionBar";

type GlobalActivityFeedProps = {
  items: GlobalPoolActivityFeedRow[];
  reactions: ActivityReactionsSnapshot;
  viewerParticipantIdByPoolId: Record<string, string>;
  emptyFilterMessage?: string;
};

function itemMetadataInsightLabel(
  item: GlobalPoolActivityFeedRow,
): PoolInsightLabel | null {
  const v = item.metadata_json.insight_label;
  if (v === "POOL INSIGHT") return v;
  return null;
}

function itemMetadataMilestoneLabel(
  item: GlobalPoolActivityFeedRow,
): PoolMilestoneLabel | null {
  const v = item.metadata_json.milestone_label;
  if (v === "MILESTONE" || v === "DEADLINE" || v === "POOL UPDATE") return v;
  return null;
}

function insightCardLabel(label: PoolInsightLabel | null): string {
  return label ?? "Pool insight";
}

function milestoneCardLabel(label: PoolMilestoneLabel | null): string {
  return label ?? "Milestone";
}

function typeLabel(
  type: GlobalPoolActivityFeedRow["type"],
  item?: GlobalPoolActivityFeedRow,
): string {
  switch (type) {
    case "participant_joined":
      return "Joined";
    case "participant_submitted_picks":
      return "Picks";
    case "participant_updated_picks":
      return "Update";
    case "ash_daily_recap":
      return "Ash Daily Recap";
    case "announcement":
      return "Announcement";
    case "pool_milestone":
      return milestoneCardLabel(
        item ? itemMetadataMilestoneLabel(item) : null,
      );
    case "pool_insight":
      return insightCardLabel(item ? itemMetadataInsightLabel(item) : null);
    default:
      return "Activity";
  }
}

function typeIcon(
  type: GlobalPoolActivityFeedRow["type"],
  item?: GlobalPoolActivityFeedRow,
): string {
  switch (type) {
    case "participant_joined":
      return "👋";
    case "participant_submitted_picks":
      return "✓";
    case "participant_updated_picks":
      return "↻";
    case "ash_daily_recap":
      return "📻";
    case "announcement":
      return "📢";
    case "pool_milestone":
      return "🏁";
    case "pool_insight": {
      const icon = item?.metadata_json.icon;
      return typeof icon === "string" && icon.trim() ? icon : "💡";
    }
    default:
      return "•";
  }
}

function insightCardClasses(): string {
  return "border-violet-500/35 bg-gradient-to-br from-violet-500/12 to-ash-body/40 ring-1 ring-violet-500/15";
}

function milestoneCardClasses(label: PoolMilestoneLabel | null): string {
  switch (label) {
    case "DEADLINE":
      return "border-orange-500/35 bg-gradient-to-br from-orange-500/12 to-ash-body/40 ring-1 ring-orange-500/15";
    case "POOL UPDATE":
      return "border-sky-500/35 bg-gradient-to-br from-sky-500/12 to-ash-body/40 ring-1 ring-sky-500/15";
    case "MILESTONE":
    default:
      return "border-emerald-500/35 bg-gradient-to-br from-emerald-500/12 to-ash-body/40 ring-1 ring-emerald-500/15";
  }
}

export function GlobalActivityFeed({
  items,
  reactions,
  viewerParticipantIdByPoolId,
  emptyFilterMessage,
}: GlobalActivityFeedProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-ash-border bg-ash-body/30 px-6 py-12 text-center">
        <p className="text-sm text-ash-muted">
          {emptyFilterMessage ??
            "No activity matches your filters. Try another pool or activity type."}
        </p>
      </div>
    );
  }

  const ashBotByActivityId = buildAshBotCommentsForFeed(items, {
    ashbotEnabled: true,
    liveRecapFacts: null,
    liveRecapDateYmd: null,
  });

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => {
        const isRecap = item.type === "ash_daily_recap";
        const isAnnouncement = item.type === "announcement";
        const isMilestone = item.type === "pool_milestone";
        const isInsight = item.type === "pool_insight";
        const milestoneLabel = isMilestone
          ? itemMetadataMilestoneLabel(item)
          : null;
        const recapBody =
          item.type === "ash_daily_recap"
            ? ashDailyRecapDisplayBody(item, null, null)
            : item.body_text;
        const rel = formatRelativeTimeEn(item.created_at);
        const viewerParticipantId =
          viewerParticipantIdByPoolId[item.pool_id] ?? null;
        const reactionProps = reactionBarPropsForActivity(item.id, reactions);
        const hasReactions =
          reactionProps.initialSummaries.length > 0 ||
          Object.keys(reactionProps.initialCounts).length > 0;
        const ashBotText = item.ashbot_enabled
          ? (ashBotByActivityId.get(item.id) ?? null)
          : null;
        const showViewPicks =
          item.related_path &&
          item.related_path.startsWith("/") &&
          (item.type === "participant_submitted_picks" ||
            item.type === "participant_updated_picks");

        return (
          <li key={item.id}>
            <article
              className={`rounded-xl border px-4 py-3 ${
                isRecap
                  ? "border-ash-accent/40 bg-gradient-to-br from-ash-accent/10 to-ash-body/40 ring-1 ring-ash-accent/20"
                  : isMilestone
                    ? milestoneCardClasses(milestoneLabel)
                    : isInsight
                      ? insightCardClasses()
                      : isAnnouncement
                      ? "border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-ash-body/40"
                      : "border-ash-border bg-ash-surface"
              }`}
            >
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-ash-accent">
                Pool: {item.pool_name}
              </p>
              <div className="flex items-start gap-3">
                <span
                  className="mt-0.5 text-lg leading-none opacity-90"
                  aria-hidden
                >
                  {typeIcon(item.type, item)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-ash-muted">
                      {typeLabel(item.type, item)}
                    </span>
                    {isRecap && item.is_ai_generated ? (
                      <span className="rounded-full bg-ash-accent/25 px-2 py-0.5 text-[10px] font-bold uppercase text-ash-accent">
                        AI
                      </span>
                    ) : null}
                    <span className="text-xs text-ash-muted">{rel}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ash-text">
                    {recapBody}
                  </p>
                  {showViewPicks ? (
                    <div className="mt-2">
                      <Link
                        href={item.related_path!}
                        className="inline-flex text-xs font-medium text-ash-accent underline-offset-2 hover:underline"
                      >
                        View picks
                      </Link>
                    </div>
                  ) : null}
                  {ashBotText ? <AshBotCommentaryLine text={ashBotText} /> : null}
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <Link
                      href={`/admin/activity?pool=${item.pool_id}`}
                      className="ash-link text-xs font-medium"
                    >
                      View pool activity
                    </Link>
                  </div>
                  {hasReactions && viewerParticipantId ? (
                    <ActivityReactionBar
                      activityId={item.id}
                      poolId={item.pool_id}
                      participantId={viewerParticipantId}
                      initialCounts={reactionProps.initialCounts}
                      initialViewerReaction={reactionProps.initialViewerReaction}
                      initialSummaries={reactionProps.initialSummaries}
                    />
                  ) : hasReactions ? (
                    <ActivityReactionBar
                      activityId={item.id}
                      poolId={item.pool_id}
                      participantId=""
                      initialCounts={reactionProps.initialCounts}
                      initialViewerReaction={null}
                      initialSummaries={reactionProps.initialSummaries}
                      readOnly
                    />
                  ) : null}
                </div>
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
