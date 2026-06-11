import Link from "next/link";
import { buildAshBotCommentsForFeed } from "../../lib/activity/ashbotCommentary";
import { isPostLockPoolInsightSourceKey } from "../../lib/account/buildPoolReveal";
import { formatRelativeTimeEn } from "../../lib/datetime/formatRelativeTimeEn";
import {
  ashDailyRecapDisplayBody,
  type RecapFacts,
} from "../../lib/poolActivity/buildDeterministicRecapBody";
import type { ActivityReactionsSnapshot } from "../../lib/poolActivity/activityReactionTypes";
import {
  activityRowsFromDisplayItems,
  isActivityDisplayItem,
  isGroupedSystemActivityDisplayItem,
  type PoolActivityDisplayItem,
} from "../../lib/poolActivity/activityFeedDisplayTypes";
import type { PoolInsightLabel, PoolMilestoneLabel } from "../../lib/poolActivity/poolActivityTypes";
import { AshBotCommentaryLine } from "./AshBotCommentaryLine";
import {
  ActivityReactionBar,
  reactionBarPropsForActivity,
} from "./ActivityReactionBar";
import { GroupedMilestoneSummaryCard } from "./GroupedMilestoneSummaryCard";

type PoolActivityFeedProps = {
  items: PoolActivityDisplayItem[];
  /** When true, omit pool title and use tighter spacing (dashboard preview). */
  compact?: boolean;
  /** Recomputed on each load so today’s recap cannot show stale completion counts. */
  liveRecapFacts?: RecapFacts | null;
  liveRecapDateYmd?: string | null;
  /** Required for reaction buttons when the viewer is a pool member. */
  poolId?: string;
  viewerParticipantId?: string | null;
  reactions?: ActivityReactionsSnapshot;
  emptyFilterMessage?: string;
  /** When false, omit AshBot template commentary (pool setting). */
  ashbotEnabled?: boolean;
  /** Link to pool reveal page for post-lock insight cards. */
  revealHref?: string | null;
  /** Pool admins only — recap rows may include internal completion diagnostics. */
  showCompletionDiagnostics?: boolean;
};

function itemMetadataInsightLabel(
  item: Extract<PoolActivityDisplayItem, { kind: "activity" }>,
): PoolInsightLabel | null {
  const v = item.metadata_json.insight_label;
  if (v === "POOL INSIGHT") return v;
  return null;
}

function itemMetadataMilestoneLabel(
  item: Extract<PoolActivityDisplayItem, { kind: "activity" }>,
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
  type: Extract<PoolActivityDisplayItem, { kind: "activity" }>["type"],
  item?: Extract<PoolActivityDisplayItem, { kind: "activity" }>,
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
    case "ash_score_impact":
      return "AshBot · Score impact";
    default:
      return "Activity";
  }
}

function isCompletionDiagnostics(
  v: unknown,
): v is Array<Record<string, unknown>> {
  return Array.isArray(v) && v.every((x) => x !== null && typeof x === "object");
}

function typeIcon(
  type: Extract<PoolActivityDisplayItem, { kind: "activity" }>["type"],
  item?: Extract<PoolActivityDisplayItem, { kind: "activity" }>,
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

export function PoolActivityFeed({
  items,
  compact,
  liveRecapFacts = null,
  liveRecapDateYmd = null,
  poolId,
  viewerParticipantId,
  reactions,
  emptyFilterMessage,
  ashbotEnabled = true,
  revealHref = null,
  showCompletionDiagnostics = false,
}: PoolActivityFeedProps) {
  const canReact = Boolean(poolId && viewerParticipantId && reactions);
  const activityRows = activityRowsFromDisplayItems(items);
  const ashBotByActivityId = buildAshBotCommentsForFeed(activityRows, {
    ashbotEnabled,
    liveRecapFacts,
    liveRecapDateYmd,
  });

  if (items.length === 0) {
    return (
      <div
        className={`rounded-xl border border-dashed border-ash-border bg-ash-body/30 text-center ${compact ? "px-4 py-6" : "px-6 py-12"}`}
      >
        <p className="text-sm text-ash-muted">
          {emptyFilterMessage ??
            "No activity yet. Join events and pick milestones will show up here, plus Ash recaps when the pool picture changes."}
        </p>
      </div>
    );
  }

  return (
    <ul className={`flex flex-col ${compact ? "gap-2" : "gap-3"}`}>
      {items.map((item) => {
        if (isGroupedSystemActivityDisplayItem(item)) {
          return (
            <li key={item.id}>
              <GroupedMilestoneSummaryCard item={item} compact={compact} />
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
        const rawDiag = item.metadata_json.completion_diagnostics;
        const completionDiag = isCompletionDiagnostics(rawDiag) ? rawDiag : null;
        const recapBody =
          item.type === "ash_daily_recap"
            ? ashDailyRecapDisplayBody(item, liveRecapFacts, liveRecapDateYmd)
            : item.body_text;
        const rel = formatRelativeTimeEn(item.created_at);
        const reactionProps =
          canReact && reactions
            ? reactionBarPropsForActivity(item.id, reactions)
            : null;
        const ashBotText = ashBotByActivityId.get(item.id) ?? null;
        const showViewPicks =
          item.related_path &&
          item.related_path.startsWith("/") &&
          (item.type === "participant_submitted_picks" ||
            item.type === "participant_updated_picks");
        const insightSourceKey =
          typeof item.metadata_json.source_key === "string"
            ? item.metadata_json.source_key
            : null;
        const showViewReveal =
          Boolean(revealHref) &&
          isInsight &&
          isPostLockPoolInsightSourceKey(insightSourceKey);
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
                  {showViewReveal && revealHref ? (
                    <div className="mt-2">
                      <Link
                        href={revealHref}
                        className="inline-flex text-xs font-medium text-ash-accent underline-offset-2 hover:underline"
                      >
                        View reveal
                      </Link>
                    </div>
                  ) : null}
                  {ashBotText ? <AshBotCommentaryLine text={ashBotText} /> : null}
                  {showCompletionDiagnostics &&
                  isRecap &&
                  completionDiag &&
                  completionDiag.length > 0 ? (
                    <details className="mt-2 text-xs text-ash-muted">
                      <summary className="cursor-pointer select-none font-medium text-ash-text/80">
                        Bracket completion diagnostics
                      </summary>
                      <pre className="mt-2 max-h-64 overflow-auto rounded border border-ash-border bg-ash-body/50 p-2 text-[11px] leading-snug">
                        {JSON.stringify(completionDiag, null, 2)}
                      </pre>
                    </details>
                  ) : null}
                  {canReact && reactionProps && poolId && viewerParticipantId ? (
                    <ActivityReactionBar
                      activityId={item.id}
                      poolId={poolId}
                      participantId={viewerParticipantId}
                      initialCounts={reactionProps.initialCounts}
                      initialViewerReaction={reactionProps.initialViewerReaction}
                      initialSummaries={reactionProps.initialSummaries}
                      compact={compact}
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
