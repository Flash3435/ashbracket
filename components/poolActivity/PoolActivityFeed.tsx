import Link from "next/link";
import { buildAshBotComment } from "../../lib/activity/ashbotCommentary";
import { formatRelativeTimeEn } from "../../lib/datetime/formatRelativeTimeEn";
import {
  ashDailyRecapDisplayBody,
  type RecapFacts,
} from "../../lib/poolActivity/buildDeterministicRecapBody";
import type { ActivityReactionsSnapshot } from "../../lib/poolActivity/activityReactionTypes";
import type { PoolActivityFeedRow } from "../../lib/poolActivity/poolActivityTypes";
import { AshBotCommentaryLine } from "./AshBotCommentaryLine";
import {
  ActivityReactionBar,
  reactionBarPropsForActivity,
} from "./ActivityReactionBar";

type PoolActivityFeedProps = {
  items: PoolActivityFeedRow[];
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
};

function typeLabel(type: PoolActivityFeedRow["type"]): string {
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
    default:
      return "Activity";
  }
}

function isCompletionDiagnostics(
  v: unknown,
): v is Array<Record<string, unknown>> {
  return Array.isArray(v) && v.every((x) => x !== null && typeof x === "object");
}

function typeIcon(type: PoolActivityFeedRow["type"]): string {
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
    default:
      return "•";
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
}: PoolActivityFeedProps) {
  const canReact = Boolean(poolId && viewerParticipantId && reactions);

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
        const isRecap = item.type === "ash_daily_recap";
        const isAnnouncement = item.type === "announcement";
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
        const ashBotText = ashbotEnabled
          ? buildAshBotComment(item, {
              liveRecapFacts,
              liveRecapDateYmd,
            })
          : null;
        return (
          <li key={item.id}>
            <article
              className={`rounded-xl border px-4 py-3 ${
                isRecap
                  ? "border-ash-accent/40 bg-gradient-to-br from-ash-accent/10 to-ash-body/40 ring-1 ring-ash-accent/20"
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
                  {typeIcon(item.type)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-ash-muted">
                      {typeLabel(item.type)}
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
                  {ashBotText ? <AshBotCommentaryLine text={ashBotText} /> : null}
                  {isRecap && completionDiag && completionDiag.length > 0 ? (
                    <details className="mt-2 text-xs text-ash-muted">
                      <summary className="cursor-pointer select-none font-medium text-ash-text/80">
                        Bracket completion diagnostics (debug)
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
                      compact={compact}
                    />
                  ) : null}
                  {item.related_path &&
                  item.related_path.startsWith("/") &&
                  (item.type === "participant_submitted_picks" ||
                    item.type === "participant_updated_picks") ? (
                    <div className="mt-2">
                      <Link
                        href={item.related_path}
                        className="inline-flex text-xs font-medium text-ash-accent underline-offset-2 hover:underline"
                      >
                        View picks
                      </Link>
                    </div>
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
