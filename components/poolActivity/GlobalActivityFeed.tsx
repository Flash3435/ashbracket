import Link from "next/link";
import { buildAshBotCommentsForFeed } from "@/lib/activity/ashbotCommentary";
import { formatRelativeTimeEn } from "@/lib/datetime/formatRelativeTimeEn";
import { ashDailyRecapDisplayBody } from "@/lib/poolActivity/buildDeterministicRecapBody";
import type { ActivityReactionsSnapshot } from "@/lib/poolActivity/activityReactionTypes";
import {
  activityRowsFromDisplayItems,
  isActivityDisplayItem,
  isGroupedSystemActivityDisplayItem,
  type GlobalActivityDisplayItem,
} from "@/lib/poolActivity/activityFeedDisplayTypes";
import type { PoolInsightLabel, PoolMilestoneLabel } from "@/lib/poolActivity/poolActivityTypes";
import { scoringRulesUpdate2026ActivityTypeLabel } from "@/lib/poolActivity/scoringRulesUpdateAnnouncement";
import { AshBotCommentaryLine } from "./AshBotCommentaryLine";
import {
  ActivityReactionBar,
  reactionBarPropsForActivity,
} from "./ActivityReactionBar";
import { GroupedMilestoneSummaryCard } from "./GroupedMilestoneSummaryCard";

type GlobalActivityFeedProps = {
  items: GlobalActivityDisplayItem[];
  reactions: ActivityReactionsSnapshot;
  viewerParticipantIdByPoolId: Record<string, string>;
  emptyFilterMessage?: string;
};

function itemMetadataInsightLabel(
  item: Extract<GlobalActivityDisplayItem, { kind: "activity" }>,
): PoolInsightLabel | null {
  const v = item.metadata_json.insight_label;
  if (v === "POOL INSIGHT") return v;
  return null;
}

function itemMetadataMilestoneLabel(
  item: Extract<GlobalActivityDisplayItem, { kind: "activity" }>,
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
  type: Extract<GlobalActivityDisplayItem, { kind: "activity" }>["type"],
  item?: Extract<GlobalActivityDisplayItem, { kind: "activity" }>,
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
    case "pool_milestone": {
      const ashbotLabel = item ? scoringRulesUpdate2026ActivityTypeLabel(item) : null;
      if (ashbotLabel) return ashbotLabel;
      return milestoneCardLabel(
        item ? itemMetadataMilestoneLabel(item) : null,
      );
    }
    case "pool_insight":
      return insightCardLabel(item ? itemMetadataInsightLabel(item) : null);
    case "ash_score_impact":
      return "AshBot · Score impact";
    default:
      return "Activity";
  }
}

function typeIcon(
  type: Extract<GlobalActivityDisplayItem, { kind: "activity" }>["type"],
  item?: Extract<GlobalActivityDisplayItem, { kind: "activity" }>,
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
      if (item && scoringRulesUpdate2026ActivityTypeLabel(item)) return "🤖";
      return "🏁";
    case "pool_insight": {
      const icon = item?.metadata_json.icon;
      return typeof icon === "string" && icon.trim() ? icon : "💡";
    }
    case "ash_score_impact":
      return "🤖";
    default:
      return "•";
  }
}

function insightCardClasses(): string {
  return "border-violet-500/35 bg-gradient-to-br from-violet-500/12 to-ash-body/40 ring-1 ring-violet-500/15";
}

function scoreImpactCardClasses(): string {
  return "border-cyan-500/35 bg-gradient-to-br from-cyan-500/12 to-ash-body/40 ring-1 ring-cyan-500/15";
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

  const activityRows = activityRowsFromDisplayItems(items);
  const ashBotByActivityId = buildAshBotCommentsForFeed(activityRows, {
    ashbotEnabled: true,
    liveRecapFacts: null,
    liveRecapDateYmd: null,
  });

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => {
        if (isGroupedSystemActivityDisplayItem(item)) {
          return (
            <li key={item.id}>
              <GroupedMilestoneSummaryCard
                item={item}
                poolName={item.poolName}
              />
            </li>
          );
        }

        if (!isActivityDisplayItem(item)) return null;

        const isRecap = item.type === "ash_daily_recap";
        const isAnnouncement = item.type === "announcement";
        const isMilestone = item.type === "pool_milestone";
        const isInsight = item.type === "pool_insight";
        const isScoreImpact = item.type === "ash_score_impact";
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
                      : isScoreImpact
                        ? scoreImpactCardClasses()
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
