export const ALLOWED_ACTIVITY_REACTIONS = [
  "👍",
  "😂",
  "🔥",
  "🏆",
  "👀",
  "😬",
] as const;

export type ActivityReactionEmoji = (typeof ALLOWED_ACTIVITY_REACTIONS)[number];

/** Accessible names for reaction picker buttons. */
export const REACTION_ARIA_LABELS: Record<ActivityReactionEmoji, string> = {
  "👍": "thumbs up",
  "😂": "laughing",
  "🔥": "fire",
  "🏆": "trophy",
  "👀": "eyes",
  "😬": "grimacing",
};

export function isAllowedActivityReaction(v: string): v is ActivityReactionEmoji {
  return (ALLOWED_ACTIVITY_REACTIONS as readonly string[]).includes(v);
}

/** Reactions with count > 0, preserving canonical emoji order. */
export function activeReactionEmojis(
  counts: Partial<Record<ActivityReactionEmoji, number>>,
): ActivityReactionEmoji[] {
  return ALLOWED_ACTIVITY_REACTIONS.filter((emoji) => (counts[emoji] ?? 0) > 0);
}
