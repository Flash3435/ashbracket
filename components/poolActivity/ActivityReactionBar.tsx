"use client";

import { useCallback, useState, useTransition } from "react";
import { toggleActivityReactionAction } from "@/lib/poolActivity/poolActivityActions";
import {
  ALLOWED_ACTIVITY_REACTIONS,
  type ActivityReactionEmoji,
} from "@/lib/poolActivity/reactionConstants";
import type { ActivityReactionCounts } from "@/lib/poolActivity/activityReactionTypes";

type ActivityReactionBarProps = {
  activityId: string;
  poolId: string;
  participantId: string;
  initialCounts: Partial<Record<ActivityReactionEmoji, number>>;
  initialViewerReaction: ActivityReactionEmoji | null;
  compact?: boolean;
};

export function ActivityReactionBar({
  activityId,
  poolId,
  participantId,
  initialCounts,
  initialViewerReaction,
  compact,
}: ActivityReactionBarProps) {
  const [counts, setCounts] =
    useState<Partial<Record<ActivityReactionEmoji, number>>>(initialCounts);
  const [viewerReaction, setViewerReaction] =
    useState<ActivityReactionEmoji | null>(initialViewerReaction);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();

  const onReact = useCallback(
    (emoji: ActivityReactionEmoji) => {
      setError(null);
      startTransition(async () => {
        const result = await toggleActivityReactionAction({
          poolId,
          participantId,
          activityId,
          reaction: emoji,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setCounts(result.counts);
        setViewerReaction(result.viewerReaction);
      });
    },
    [activityId, participantId, poolId],
  );

  const showCount = (emoji: ActivityReactionEmoji) => {
    const n = counts[emoji] ?? 0;
    return n > 0 || expanded;
  };

  return (
    <div className={compact ? "mt-1.5" : "mt-2"}>
      <div
        className="flex flex-wrap items-center gap-1"
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        onFocusCapture={() => setExpanded(true)}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setExpanded(false);
          }
        }}
      >
        {ALLOWED_ACTIVITY_REACTIONS.map((emoji) => {
          const selected = viewerReaction === emoji;
          const count = counts[emoji] ?? 0;
          const visible = showCount(emoji);
          return (
            <button
              key={emoji}
              type="button"
              disabled={pending}
              aria-pressed={selected}
              aria-label={`React with ${emoji}${count > 0 ? `, ${count} reactions` : ""}`}
              onClick={() => onReact(emoji)}
              className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-xs transition-colors disabled:opacity-60 ${
                selected
                  ? "border-ash-accent/60 bg-ash-accent/20 text-ash-text ring-1 ring-ash-accent/30"
                  : "border-ash-border/80 bg-ash-body/40 text-ash-muted hover:border-ash-accent/40 hover:bg-ash-body/70 hover:text-ash-text"
              } ${!visible ? "min-w-[1.75rem] justify-center" : ""}`}
            >
              <span aria-hidden>{emoji}</span>
              {visible && count > 0 ? (
                <span className="min-w-[0.65rem] text-[10px] font-semibold tabular-nums">
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {error ? (
        <p className="mt-1 text-[11px] text-red-300" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Batch initial server counts into per-activity shape for cards. */
export function reactionBarPropsForActivity(
  activityId: string,
  reactions: {
    counts: ActivityReactionCounts;
    viewerReactions: Record<string, ActivityReactionEmoji>;
  },
): {
  initialCounts: Partial<Record<ActivityReactionEmoji, number>>;
  initialViewerReaction: ActivityReactionEmoji | null;
} {
  return {
    initialCounts: reactions.counts[activityId] ?? {},
    initialViewerReaction: reactions.viewerReactions[activityId] ?? null,
  };
}
