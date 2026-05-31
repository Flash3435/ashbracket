"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import { toggleActivityReactionAction } from "@/lib/poolActivity/poolActivityActions";
import {
  activeReactionEmojis,
  ALLOWED_ACTIVITY_REACTIONS,
  REACTION_ARIA_LABELS,
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

const pillBase =
  "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ash-accent/50 disabled:opacity-60";

function selectedPillClass(selected: boolean) {
  return selected
    ? "border-ash-accent/60 bg-ash-accent/20 text-ash-text ring-1 ring-ash-accent/30"
    : "border-ash-border/80 bg-ash-body/40 text-ash-muted hover:border-ash-accent/40 hover:bg-ash-body/70 hover:text-ash-text";
}

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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const pickerId = useId();

  const visibleReactions = activeReactionEmojis(counts);
  const hasVisibleReactions = visibleReactions.length > 0;

  const closePicker = useCallback(() => setPickerOpen(false), []);

  useEffect(() => {
    if (!pickerOpen) return;

    function onPointerDown(e: MouseEvent | TouchEvent) {
      const root = rootRef.current;
      if (root && !root.contains(e.target as Node)) {
        closePicker();
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closePicker();
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [pickerOpen, closePicker]);

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
        setPickerOpen(false);
      });
    },
    [activityId, participantId, poolId],
  );

  function onCountPillClick(emoji: ActivityReactionEmoji) {
    if (viewerReaction === emoji) {
      onReact(emoji);
      return;
    }
    setPickerOpen(true);
  }

  return (
    <div ref={rootRef} className={compact ? "mt-1.5" : "mt-2"}>
      <div className="flex flex-wrap items-center gap-1">
        {visibleReactions.map((emoji) => {
          const selected = viewerReaction === emoji;
          const count = counts[emoji] ?? 0;
          const label = REACTION_ARIA_LABELS[emoji];
          return (
            <button
              key={emoji}
              type="button"
              disabled={pending}
              aria-pressed={selected}
              aria-label={`${label}, ${count} ${count === 1 ? "reaction" : "reactions"}${selected ? ", your reaction" : ""}`}
              title={selected ? `Remove your ${label} reaction` : `${label} (${count})`}
              onClick={() => onCountPillClick(emoji)}
              className={`${pillBase} ${selectedPillClass(selected)}`}
            >
              <span aria-hidden>{emoji}</span>
              <span className="min-w-[0.65rem] text-[10px] font-semibold tabular-nums">
                {count}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          disabled={pending}
          aria-expanded={pickerOpen}
          aria-controls={pickerId}
          aria-label={
            viewerReaction
              ? "Change your reaction"
              : hasVisibleReactions
                ? "Add a reaction"
                : "React to this activity"
          }
          title={viewerReaction ? "Change reaction" : "React"}
          onClick={() => setPickerOpen((open) => !open)}
          className={`${pillBase} border-ash-border/80 bg-ash-body/30 text-ash-muted hover:border-ash-accent/40 hover:bg-ash-body/60 hover:text-ash-text`}
        >
          <span aria-hidden className="text-[11px] font-semibold leading-none">
            +
          </span>
          {!hasVisibleReactions ? (
            <span className="text-[10px] font-medium">React</span>
          ) : null}
        </button>
      </div>

      {pickerOpen ? (
        <div
          id={pickerId}
          role="group"
          aria-label="Choose a reaction"
          className="mt-1.5 flex flex-wrap items-center gap-1 rounded-lg border border-ash-border/70 bg-ash-body/50 p-1.5"
        >
          {ALLOWED_ACTIVITY_REACTIONS.map((emoji) => {
            const selected = viewerReaction === emoji;
            const count = counts[emoji] ?? 0;
            const label = REACTION_ARIA_LABELS[emoji];
            return (
              <button
                key={emoji}
                type="button"
                disabled={pending}
                aria-pressed={selected}
                aria-label={`React with ${label}${count > 0 ? `, ${count} so far` : ""}`}
                title={`React with ${label}`}
                onClick={() => onReact(emoji)}
                className={`${pillBase} min-w-[1.75rem] justify-center ${selectedPillClass(selected)}`}
              >
                <span aria-hidden>{emoji}</span>
              </button>
            );
          })}
        </div>
      ) : null}

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
